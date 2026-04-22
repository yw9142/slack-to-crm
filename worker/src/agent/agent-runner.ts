import type {
  AgentToolCall,
  JsonRecord,
  SlackAgentApplyRequest,
  SlackAgentApplyResponse,
  SlackAgentProcessRequest,
  SlackAgentProcessResponse,
  ToolExecutionRecord,
  WriteDraft,
} from '../types';
import type { AgentAdapter } from './agent-adapter';
import { CORE_CHAT_PROMPT } from './prompt';
import type { ToolPolicyGateway } from '../policy/tool-policy-gateway';

export type AgentRunnerOptions = {
  adapter: AgentAdapter;
  maxSteps?: number;
  policyGateway: ToolPolicyGateway;
};

export class AgentRunner {
  private readonly adapter: AgentAdapter;
  private readonly maxSteps: number;
  private readonly policyGateway: ToolPolicyGateway;

  public constructor(options: AgentRunnerOptions) {
    this.adapter = options.adapter;
    this.maxSteps = options.maxSteps ?? 6;
    this.policyGateway = options.policyGateway;
  }

  public async process(
    request: SlackAgentProcessRequest,
  ): Promise<SlackAgentProcessResponse> {
    const metaContext = await this.loadMetaContext();
    const toolResults: ToolExecutionRecord[] = [];
    const writeDrafts: WriteDraft[] = [];
    let assistantMessage = 'CRM 요청을 처리했습니다.';
    let metadata: JsonRecord | undefined;
    let nextRequest: SlackAgentProcessRequest = {
      ...request,
      context: {
        ...request.context,
        ...metaContext,
      },
    };

    for (let stepIndex = 0; stepIndex < this.maxSteps; stepIndex += 1) {
      const adapterOutput = await this.adapter.run({
        request: nextRequest,
        systemPrompt: CORE_CHAT_PROMPT,
      });

      assistantMessage = adapterOutput.assistantMessage;
      metadata = adapterOutput.metadata;

      if (adapterOutput.toolCalls.length === 0) {
        break;
      }

      const stepResult = await this.executeToolCalls(adapterOutput.toolCalls);

      stepResult.toolResults.forEach((toolResult) =>
        toolResults.push(toolResult),
      );
      stepResult.writeDrafts.forEach((writeDraft) =>
        writeDrafts.push(writeDraft),
      );

      nextRequest = {
        ...nextRequest,
        context: {
          ...nextRequest.context,
          toolHistory: toolResults,
        },
        toolCalls: undefined,
      };

      if (stepResult.writeDrafts.length > 0) {
        break;
      }
    }

    return {
      assistantMessage,
      metadata,
      status: writeDrafts.length > 0 ? 'needs_approval' : 'completed',
      toolResults,
      writeDrafts,
    };
  }

  public async apply(
    request: SlackAgentApplyRequest,
  ): Promise<SlackAgentApplyResponse> {
    const draft =
      request.draft ??
      (await this.loadDraftFromApproval(request.slackAgentApprovalId));

    if (!draft) {
      throw new Error('Approved apply request does not include a write draft');
    }

    const applyResult = await this.policyGateway.applyApprovedDraft({
      approvalId: request.approvalId ?? request.slackAgentApprovalId,
      approvedBySlackUserId: request.approvedBySlackUserId ?? 'unknown-slack-user',
      draft,
    });

    return {
      draftId: applyResult.draftId,
      result: applyResult.result,
      status: 'applied',
      toolName: 'execute_tool',
    };
  }

  private async executeToolCalls(toolCalls: AgentToolCall[]): Promise<{
    toolResults: ToolExecutionRecord[];
    writeDrafts: WriteDraft[];
  }> {
    const toolResults: ToolExecutionRecord[] = [];
    const writeDrafts: WriteDraft[] = [];

    for (const toolCall of toolCalls) {
      const policyResult = await this.policyGateway.executeToolCall(toolCall);

      if (policyResult.kind === 'tool_result') {
        toolResults.push({
          kind: policyResult.classification,
          result: policyResult.result,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });
      }

      if (policyResult.kind === 'write_draft') {
        writeDrafts.push(policyResult.draft);
        toolResults.push({
          draft: policyResult.draft,
          kind: 'write_draft',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });
      }

      if (policyResult.kind === 'denied') {
        toolResults.push({
          kind: 'denied',
          message: policyResult.message,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });
      }
    }

    return { toolResults, writeDrafts };
  }

  private async loadMetaContext(): Promise<JsonRecord> {
    const context: JsonRecord = {};

    await Promise.all(
      [
        ['toolCatalog', 'get_tool_catalog'],
        ['skills', 'load_skills'],
      ].map(async ([contextKey, toolName]) => {
        try {
          context[contextKey] = await this.policyGateway.callReadTool(toolName, {
            query: 'Twenty CRM Slack CRUD agent',
          });
        } catch (error) {
          context[`${contextKey}Error`] =
            error instanceof Error ? error.message : 'Unknown MCP error';
        }
      }),
    );

    return context;
  }

  private async loadDraftFromApproval(
    slackAgentApprovalId: string | undefined,
  ): Promise<WriteDraft | null> {
    if (!slackAgentApprovalId) {
      return null;
    }

    const toolNames = [
      'find_one_slackAgentApproval',
      'find_one_slack_agent_approval',
    ];

    for (const toolName of toolNames) {
      try {
        const result = await this.policyGateway.callReadTool(toolName, {
          id: slackAgentApprovalId,
        });
        const draft = findWriteDraft(result);

        if (draft) {
          return draft;
        }
      } catch {
        // Try the next naming convention exposed by the MCP catalog.
      }
    }

    return null;
  }
}

const isJsonRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parseJsonText = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const findWriteDraft = (value: unknown): WriteDraft | null => {
  if (!isJsonRecord(value)) {
    return null;
  }

  const directDraft = normalizeWriteDraft(value);

  if (directDraft) {
    return directDraft;
  }

  for (const candidateKey of [
    'draft',
    'workerPayload',
    'appliedResult',
    'result',
    'data',
    'record',
    'slackAgentApproval',
  ]) {
    const nestedValue = value[candidateKey];
    const nestedDraft = findWriteDraft(nestedValue);

    if (nestedDraft) {
      return nestedDraft;
    }
  }

  if (Array.isArray(value.content)) {
    for (const contentItem of value.content) {
      if (!isJsonRecord(contentItem) || typeof contentItem.text !== 'string') {
        continue;
      }

      const nestedDraft = findWriteDraft(parseJsonText(contentItem.text));

      if (nestedDraft) {
        return nestedDraft;
      }
    }
  }

  return null;
};

const normalizeWriteDraft = (value: JsonRecord): WriteDraft | null => {
  if (
    typeof value.id !== 'string' ||
    typeof value.toolName !== 'string' ||
    !isJsonRecord(value.arguments)
  ) {
    return null;
  }

  return {
    approvalPolicy: 'slack_user_approval_required',
    arguments: value.arguments,
    createdAt:
      typeof value.createdAt === 'string'
        ? value.createdAt
        : new Date().toISOString(),
    id: value.id,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    status: 'pending_approval',
    toolName: value.toolName,
  };
};
