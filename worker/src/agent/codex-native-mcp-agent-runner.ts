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
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.workingDirectory = options.workingDirectory ?? process.cwd();
  }

  public async process(
    request: SlackAgentProcessRequest,
  ): Promise<SlackAgentProcessResponse> {
    const policySession = this.policyMcpGateway.createSession({ request });
    const metadata: JsonRecord = {
      agentEngine: 'native-mcp',
      policySessionId: policySession.id,
      promptProfile: selectPromptProfile(request.text),
    };

    try {
      const assistantMessage = await this.runCodex({
        mcpUrl: `${this.policyMcpBaseUrl}/mcp/${encodeURIComponent(
          policySession.id,
        )}`,
        policyToken: policySession.token,
        prompt: buildNativeMcpPrompt({
          request,
          runtime: buildRuntimeContext(),
        }),
      });
      const sessionResult = this.policyMcpGateway.getSessionResult(
        policySession.id,
      );
      const persistenceMetadata = await this.persistence.persistProcessResult({
        assistantMessage,
        metadata,
        request,
        toolResults: sessionResult.toolResults,
        writeDrafts: sessionResult.writeDrafts,
      });

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
    const draft =
      request.draft ??
      (await this.persistence.loadDraftFromApproval(
        request.slackAgentApprovalId,
      ));

    if (!draft) {
      throw new Error('Approved apply request does not include a write draft');
    }

    const applyResult = await this.policyGateway.applyApprovedDraft({
      approvalId: request.approvalId ?? request.slackAgentApprovalId,
      approvedBySlackUserId: request.approvedBySlackUserId ?? 'unknown-slack-user',
      draft,
    });

    await this.persistence.persistApplyResult({
      approvalId: request.approvalId ?? request.slackAgentApprovalId,
      applyResult: applyResult.result,
      request,
    });

    return {
      draftId: applyResult.draftId,
      result: applyResult.result,
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
      '-',
    ];

    if (this.model) {
      args.splice(1, 0, '--model', this.model);
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

const selectPromptProfile = (text: string | undefined): string => {
  const normalizedText = text?.toLowerCase() ?? '';

  return [
    '일일 영업',
    '영업 가이드',
    '영업가이드',
    '오늘 영업',
    'daily sales',
    'sales guide',
  ].some((keyword) => normalizedText.includes(keyword.toLowerCase()))
    ? 'daily-sales-guide'
    : 'general-crm';
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
