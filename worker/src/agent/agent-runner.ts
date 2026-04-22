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

    const persistenceMetadata = await this.persistProcessResult({
      assistantMessage,
      metadata,
      request,
      toolResults,
      writeDrafts,
    });

    return {
      assistantMessage,
      metadata: {
        ...(metadata ?? {}),
        ...persistenceMetadata,
      },
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

    await this.persistApplyResult({
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

  private async executeToolCalls(toolCalls: AgentToolCall[]): Promise<{
    toolResults: ToolExecutionRecord[];
    writeDrafts: WriteDraft[];
  }> {
    const toolResults: ToolExecutionRecord[] = [];
    const writeDrafts: WriteDraft[] = [];

    for (const toolCall of toolCalls) {
      const startedAt = new Date();
      const policyResult = await this.policyGateway.executeToolCall(toolCall);
      const finishedAt = new Date();
      const traceMetadata = {
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        finishedAt: finishedAt.toISOString(),
        input: toolCall.arguments ?? {},
        startedAt: startedAt.toISOString(),
      };

      if (policyResult.kind === 'tool_result') {
        toolResults.push({
          ...traceMetadata,
          kind: policyResult.classification,
          result: policyResult.result,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });
      }

      if (policyResult.kind === 'write_draft') {
        writeDrafts.push(policyResult.draft);
        toolResults.push({
          ...traceMetadata,
          draft: policyResult.draft,
          kind: 'write_draft',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });
      }

      if (policyResult.kind === 'denied') {
        toolResults.push({
          ...traceMetadata,
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

  private async persistProcessResult({
    assistantMessage,
    metadata,
    request,
    toolResults,
    writeDrafts,
  }: {
    assistantMessage: string;
    metadata?: JsonRecord;
    request: SlackAgentProcessRequest;
    toolResults: ToolExecutionRecord[];
    writeDrafts: WriteDraft[];
  }): Promise<JsonRecord> {
    const approvalIds: string[] = [];
    const lastProcessedAt = new Date().toISOString();

    try {
      for (const draft of writeDrafts) {
        const approvalResult = await this.policyGateway.callSystemWriteTool(
          'create_slack_agent_approval',
          {
            actions: { drafts: [draft] },
            position: 'first',
            slackAgentRequestId: request.slackAgentRequestId,
            status: 'PENDING',
            summary: assistantMessage,
            title: `Approval for ${draft.toolName}`,
            workerPayload: { draft },
          },
        );
        const approvalId = extractRecordId(approvalResult);

        if (approvalId) {
          approvalIds.push(approvalId);
        }
      }

      await this.policyGateway.callSystemWriteTool('update_slack_agent_request', {
        answerText: assistantMessage,
        draftPayload:
          writeDrafts.length > 0 ? { drafts: writeDrafts } : undefined,
        id: request.slackAgentRequestId,
        lastProcessedAt,
        mode: writeDrafts.length > 0 ? 'WRITE_DRAFT' : 'ANSWER',
        pendingApprovalId: approvalIds[0],
        resultPayload: {
          metadata,
          toolResults,
          writeDrafts,
        },
        status: writeDrafts.length > 0 ? 'AWAITING_APPROVAL' : 'COMPLETED',
      });

      await this.persistToolTraces({
        request,
        toolResults,
      });
    } catch (error) {
      return {
        persistenceError:
          error instanceof Error ? error.message : 'Unknown persistence error',
      };
    }

    return approvalIds.length > 0 ? { approvalIds } : {};
  }

  private async persistToolTraces({
    request,
    toolResults,
  }: {
    request: SlackAgentProcessRequest;
    toolResults: ToolExecutionRecord[];
  }): Promise<void> {
    const slackAgentThreadId =
      typeof request.context?.slackAgentThreadId === 'string'
        ? request.context.slackAgentThreadId
        : undefined;

    for (const toolResult of toolResults) {
      await this.createToolTrace({
        durationMs: toolResult.durationMs,
        errorMessage: toolResult.errorMessage,
        finishedAt: toolResult.finishedAt,
        input: toolResult.input,
        output: normalizeJsonRecord(
          toolResult.result ??
            toolResult.draft ??
            (toolResult.message ? { message: toolResult.message } : null),
        ),
        slackAgentRequestId: request.slackAgentRequestId,
        slackAgentThreadId,
        startedAt: toolResult.startedAt,
        status: mapToolTraceStatus(toolResult),
        toolName: toolResult.toolName,
      });
    }
  }

  private async createToolTrace(input: JsonRecord): Promise<void> {
    const toolNames = [
      'create_slack_agent_tool_trace',
      'create_slackAgentToolTrace',
    ];

    for (const toolName of toolNames) {
      try {
        await this.policyGateway.callSystemWriteTool(toolName, {
          ...input,
          title: `${String(input.status)} ${String(input.toolName)}`,
        });
        return;
      } catch {
        // Try the next naming convention exposed by the MCP catalog.
      }
    }
  }

  private async persistApplyResult({
    approvalId,
    applyResult,
    request,
  }: {
    approvalId?: string;
    applyResult: unknown;
    request: SlackAgentApplyRequest;
  }): Promise<void> {
    try {
      if (approvalId) {
        await this.policyGateway.callSystemWriteTool(
          'update_slack_agent_approval',
          {
            appliedResult: normalizeJsonRecord(applyResult),
            decidedAt: new Date().toISOString(),
            id: approvalId,
            slackApproverUserId: request.approvedBySlackUserId,
            status: 'APPROVED',
          },
        );
      }

      if (request.slackAgentRequestId) {
        await this.policyGateway.callSystemWriteTool(
          'update_slack_agent_request',
          {
            id: request.slackAgentRequestId,
            lastProcessedAt: new Date().toISOString(),
            mode: 'APPLIED',
            status: 'COMPLETED',
          },
        );
      }
    } catch {
      // Applying the approved CRM change is the source of truth. Audit writes are best effort.
    }
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

const extractRecordId = (value: unknown): string | null => {
  if (!isJsonRecord(value)) {
    return null;
  }

  if (typeof value.id === 'string') {
    return value.id;
  }

  for (const candidateKey of ['result', 'record', 'data']) {
    const nested = extractRecordId(value[candidateKey]);

    if (nested) {
      return nested;
    }
  }

  if (Array.isArray(value.content)) {
    for (const contentItem of value.content) {
      if (!isJsonRecord(contentItem) || typeof contentItem.text !== 'string') {
        continue;
      }

      const nested = extractRecordId(parseJsonText(contentItem.text));

      if (nested) {
        return nested;
      }
    }
  }

  return null;
};

const mapToolTraceStatus = (toolResult: ToolExecutionRecord): string => {
  if (toolResult.errorMessage) {
    return 'FAILED';
  }

  if (toolResult.kind === 'write_draft') {
    return 'DRAFTED';
  }

  if (toolResult.kind === 'denied') {
    return 'BLOCKED';
  }

  return 'SUCCEEDED';
};

const normalizeJsonRecord = (value: unknown): JsonRecord => {
  if (isJsonRecord(value)) {
    return value;
  }

  return { value };
};
