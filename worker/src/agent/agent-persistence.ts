import type {
  JsonRecord,
  SlackAgentApplyRequest,
  SlackAgentProcessRequest,
  ToolExecutionRecord,
  WriteDraft,
} from '../types';
import type { ToolPolicyGateway } from '../policy/tool-policy-gateway';
import {
  mapToolTraceStatus,
  normalizeJsonRecord,
  sanitizeWorkerErrorMessage,
} from '../policy/tool-execution-record';

export type AgentResultPersistenceOptions = {
  policyGateway: ToolPolicyGateway;
};

export class AgentResultPersistence {
  private readonly policyGateway: ToolPolicyGateway;

  public constructor(options: AgentResultPersistenceOptions) {
    this.policyGateway = options.policyGateway;
  }

  public async persistProcessResult({
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

  public async persistApplyResult({
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

  public async recordProcessFailure(
    request: SlackAgentProcessRequest,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.policyGateway.callSystemWriteTool('update_slack_agent_request', {
        errorMessage: sanitizeWorkerErrorMessage(errorMessage),
        id: request.slackAgentRequestId,
        lastProcessedAt: new Date().toISOString(),
        mode: 'ERROR',
        status: 'FAILED',
      });
    } catch {
      // Failure persistence is best effort; Slack still receives a safe error message.
    }
  }

  public async loadDraftFromApproval(
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
