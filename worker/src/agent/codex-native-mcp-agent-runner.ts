import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentService } from './agent-service';
import { AgentResultPersistence } from './agent-persistence';
import {
  buildNativeMcpPrompt,
  buildRuntimeContext,
} from './native-mcp-prompt';
import { selectCoreParityProfile } from './core-parity-profiles';
import {
  buildMissingWriteDraftErrorMessage,
  buildMissingWriteDraftRetryPrompt,
  shouldRetryMissingWriteDraft,
} from './write-draft-guard';
import type { PolicyMcpGateway } from '../mcp/policy-mcp-gateway';
import type { ToolPolicyGateway } from '../policy/tool-policy-gateway';
import type {
  JsonRecord,
  SlackAgentApplyRequest,
  SlackAgentApplyResponse,
  SlackAgentProcessRequest,
  SlackAgentProcessResponse,
} from '../types';

export type CodexNativeMcpAgentRunnerOptions = {
  codexBinary?: string;
  codexHome?: string;
  model?: string;
  policyMcpBaseUrl: string;
  policyMcpGateway: PolicyMcpGateway;
  policyGateway: ToolPolicyGateway;
  qualityMode?: 'core-parity' | 'legacy';
  reasoningEffort?: string;
  timeoutMs?: number;
  workingDirectory?: string;
};

export class CodexNativeMcpAgentRunner implements AgentService {
  private readonly codexBinary: string;
  private readonly codexHome?: string;
  private readonly model?: string;
  private readonly persistence: AgentResultPersistence;
  private readonly policyMcpBaseUrl: string;
  private readonly policyMcpGateway: PolicyMcpGateway;
  private readonly policyGateway: ToolPolicyGateway;
  private readonly qualityMode: 'core-parity' | 'legacy';
  private readonly reasoningEffort?: string;
  private readonly timeoutMs: number;
  private readonly workingDirectory: string;

  public constructor(options: CodexNativeMcpAgentRunnerOptions) {
    this.codexBinary = options.codexBinary ?? 'codex';
    this.codexHome = options.codexHome;
    this.model = options.model;
    this.persistence = new AgentResultPersistence({
      policyGateway: options.policyGateway,
    });
    this.policyMcpBaseUrl = options.policyMcpBaseUrl.replace(/\/$/, '');
    this.policyMcpGateway = options.policyMcpGateway;
    this.policyGateway = options.policyGateway;
    this.qualityMode = options.qualityMode ?? 'core-parity';
    this.reasoningEffort = options.reasoningEffort;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.workingDirectory = options.workingDirectory ?? process.cwd();
  }

  public async process(
    request: SlackAgentProcessRequest,
  ): Promise<SlackAgentProcessResponse> {
    const policySession = this.policyMcpGateway.createSession({ request });
    const promptProfile = selectCoreParityProfile(request.text);
    const metadata: JsonRecord = {
      agentEngine: 'native-mcp',
      agentQualityMode: this.qualityMode,
      policySessionId: policySession.id,
      promptProfile,
    };

    try {
      await this.recordProcessStarted(request);

      const initialPrompt = buildNativeMcpPrompt({
        profile: promptProfile,
        request,
        runtime: buildRuntimeContext(),
      });
      let assistantMessage = await this.runCodex({
        mcpUrl: `${this.policyMcpBaseUrl}/mcp/${encodeURIComponent(
          policySession.id,
        )}`,
        policyToken: policySession.token,
        prompt: initialPrompt,
      });
      let sessionResult = this.policyMcpGateway.getSessionResult(
        policySession.id,
      );

      if (
        shouldRetryMissingWriteDraft({
          assistantMessage,
          profile: promptProfile,
          request,
          writeDraftCount: sessionResult.writeDrafts.length,
        })
      ) {
        assistantMessage = await this.runCodex({
          mcpUrl: `${this.policyMcpBaseUrl}/mcp/${encodeURIComponent(
            policySession.id,
          )}`,
          policyToken: policySession.token,
          prompt: buildMissingWriteDraftRetryPrompt({
            assistantMessage,
            originalPrompt: initialPrompt,
          }),
        });
        sessionResult = this.policyMcpGateway.getSessionResult(policySession.id);
      }

      if (
        shouldRetryMissingWriteDraft({
          assistantMessage,
          profile: promptProfile,
          request,
          writeDraftCount: sessionResult.writeDrafts.length,
        })
      ) {
        throw new Error(buildMissingWriteDraftErrorMessage());
      }

      const persistenceMetadata = await this.persistence.persistProcessResult({
        assistantMessage,
        metadata,
        request,
        toolResults: sessionResult.toolResults,
        writeDrafts: sessionResult.writeDrafts,
      });
      const approvalIds = readStringArray(persistenceMetadata, 'approvalIds');

      if (sessionResult.writeDrafts.length > 0 && approvalIds.length === 0) {
        throw new Error(
          'CRM 승인 레코드 생성에 실패했습니다. 쓰기 draft는 만들었지만 Slack approval 버튼을 만들 수 없어 CRM에는 반영하지 않았습니다.',
        );
      }

      return {
        assistantMessage,
        metadata: {
          ...metadata,
          ...persistenceMetadata,
        },
        status:
          sessionResult.writeDrafts.length > 0 ? 'needs_approval' : 'completed',
        toolResults: sessionResult.toolResults,
        writeDrafts: sessionResult.writeDrafts,
      };
    } finally {
      this.policyMcpGateway.deleteSession(policySession.id);
    }
  }

  public async apply(
    request: SlackAgentApplyRequest,
  ): Promise<SlackAgentApplyResponse> {
    const drafts = request.draft
      ? [request.draft]
      : await this.persistence.loadDraftsFromApproval(
          request.slackAgentApprovalId,
        );

    if (drafts.length === 0) {
      throw new Error('Approved apply request does not include a write draft');
    }

    const applyResults = [];

    for (const draft of drafts) {
      applyResults.push(
        await this.policyGateway.applyApprovedDraft({
          approvalId: request.approvalId ?? request.slackAgentApprovalId,
          approvedBySlackUserId:
            request.approvedBySlackUserId ?? 'unknown-slack-user',
          draft,
        }),
      );
    }

    await this.persistence.persistApplyResult({
      approvalId: request.approvalId ?? request.slackAgentApprovalId,
      applyResult: {
        results: applyResults.map((applyResult) => ({
          draftId: applyResult.draftId,
          result: applyResult.result,
        })),
      },
      request,
    });
    const firstApplyResult = applyResults[0];

    if (!firstApplyResult) {
      throw new Error('Approved apply request did not produce a result');
    }

    return {
      draftId: firstApplyResult.draftId,
      result:
        applyResults.length === 1
          ? firstApplyResult.result
          : {
              results: applyResults.map((applyResult) => ({
                draftId: applyResult.draftId,
                result: applyResult.result,
              })),
            },
      results: applyResults.map((applyResult) => ({
        draftId: applyResult.draftId,
        result: applyResult.result,
      })),
      status: 'applied',
      toolName: 'execute_tool',
    };
  }

  public recordProcessFailure(
    request: SlackAgentProcessRequest,
    errorMessage: string,
  ): Promise<void> {
    return this.persistence.recordProcessFailure(request, errorMessage);
  }

  public recordApplyFailure(
    request: SlackAgentApplyRequest,
    errorMessage: string,
  ): Promise<void> {
    return this.persistence.recordApplyFailure(request, errorMessage);
  }

  private async recordProcessStarted(
    request: SlackAgentProcessRequest,
  ): Promise<void> {
    try {
      await this.policyGateway.callSystemWriteTool('update_slack_agent_request', {
        id: request.slackAgentRequestId,
        status: 'PROCESSING',
      });
    } catch {
      // Status visibility is useful but should not block processing.
    }
  }

  private async runCodex({
    mcpUrl,
    policyToken,
    prompt,
  }: {
    mcpUrl: string;
    policyToken: string;
    prompt: string;
  }): Promise<string> {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'slack-crm-codex-mcp-'));
    const lastMessagePath = join(tempDirectory, 'last-message.txt');

    try {
      await this.runCodexProcess({
        lastMessagePath,
        mcpUrl,
        policyToken,
        prompt,
      });

      const value = (await readFile(lastMessagePath, 'utf8')).trim();

      if (value.length === 0) {
        return 'CRM 요청을 처리했지만 최종 답변이 비어 있습니다. Slack Agent Requests에서 tool trace를 확인해 주세요.';
      }

      return value;
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  }

  private runCodexProcess({
    lastMessagePath,
    mcpUrl,
    policyToken,
    prompt,
  }: {
    lastMessagePath: string;
    mcpUrl: string;
    policyToken: string;
    prompt: string;
  }): Promise<void> {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--ignore-rules',
      '--ignore-user-config',
      '--ephemeral',
      '--color',
      'never',
      '--output-last-message',
      lastMessagePath,
      '--cd',
      this.workingDirectory,
      '-c',
      `mcp_servers.slack_crm_policy.url="${mcpUrl}"`,
      '-c',
      'mcp_servers.slack_crm_policy.bearer_token_env_var="SLACK_CRM_POLICY_MCP_TOKEN"',
      '-c',
      'mcp_servers.slack_crm_policy.default_tools_approval_mode="approve"',
      '-',
    ];

    if (this.model) {
      args.splice(1, 0, '--model', this.model);
    }

    if (this.reasoningEffort) {
      args.splice(
        args.length - 1,
        0,
        '-c',
        `model_reasoning_effort="${this.reasoningEffort}"`,
      );
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this.codexBinary, args, {
        env: buildCodexProcessEnv({
          codexHome: this.codexHome,
          policyToken,
        }),
        stdio: ['pipe', 'ignore', 'pipe'],
      });

      let stderr = '';
      let didTimeOut = false;
      const timeout = setTimeout(() => {
        didTimeOut = true;
        child.kill('SIGTERM');
      }, this.timeoutMs);

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (exitCode) => {
        clearTimeout(timeout);

        if (didTimeOut) {
          reject(new Error('Codex CLI timed out'));
          return;
        }

        if (exitCode !== 0) {
          reject(
            new Error(
              stderr.trim() ||
                `Codex CLI exited with status ${exitCode ?? 'unknown'}`,
            ),
          );
          return;
        }

        resolve();
      });

      child.stdin.end(prompt);
    });
  }
}

const readStringArray = (
  value: JsonRecord | undefined,
  key: string,
): string[] => {
  const candidate = value?.[key];

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item): item is string => typeof item === 'string');
};

const buildCodexProcessEnv = ({
  codexHome,
  policyToken,
}: {
  codexHome?: string;
  policyToken: string;
}): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || shouldOmitCodexEnvKey(key)) {
      continue;
    }

    env[key] = value;
  }

  env.SLACK_CRM_POLICY_MCP_TOKEN = policyToken;

  if (codexHome) {
    env.CODEX_HOME = codexHome;
  }

  return env;
};

const shouldOmitCodexEnvKey = (key: string): boolean =>
  key.startsWith('TWENTY_MCP_') ||
  key === 'WORKER_SHARED_SECRET' ||
  key === 'SLACK_AGENT_SHARED_SECRET' ||
  key === 'SLACK_BOT_TOKEN' ||
  key === 'SLACK_SIGNING_SECRET';
