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
import {
  classifyToolName,
  type ToolPolicyGateway,
} from '../policy/tool-policy-gateway';

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
    const metaContext = await this.loadMetaContext(request);
    const learnedToolNames = new Set<string>();
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

      const unlearnedToolNames = findUnlearnedExecutableToolNames(
        adapterOutput.toolCalls,
        learnedToolNames,
      );

      if (unlearnedToolNames.length > 0) {
        const learnResult = await this.executeToolCalls([
          {
            arguments: {
              aspects: ['description', 'schema'],
              toolNames: unlearnedToolNames,
            },
            name: 'learn_tools',
            reason:
              'Learn exact CRM tool schemas before executing read or write tools.',
          },
        ]);

        learnResult.toolResults.forEach((toolResult) => {
          toolResults.push(toolResult);
          extractLearnedToolNames(toolResult.result).forEach((toolName) =>
            learnedToolNames.add(toolName),
          );
        });

        nextRequest = {
          ...nextRequest,
          context: {
            ...nextRequest.context,
            toolHistory: toolResults,
          },
          toolCalls: undefined,
        };
        continue;
      }

      const stepResult = await this.executeToolCalls(adapterOutput.toolCalls);

      stepResult.toolResults.forEach((toolResult) =>
        toolResults.push(toolResult),
      );
      stepResult.toolResults.forEach((toolResult) => {
        if (toolResult.toolName === 'learn_tools') {
          extractLearnedToolNames(toolResult.result).forEach((toolName) =>
            learnedToolNames.add(toolName),
          );
        }
      });
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
        input: getEffectiveToolArguments(toolCall),
        startedAt: startedAt.toISOString(),
      };

      if (policyResult.kind === 'tool_result') {
        toolResults.push({
          ...traceMetadata,
          kind: policyResult.classification,
          result: policyResult.result,
          toolCallId: toolCall.id,
          toolName: getEffectiveToolName(toolCall),
        });
      }

      if (policyResult.kind === 'write_draft') {
        writeDrafts.push(policyResult.draft);
        toolResults.push({
          ...traceMetadata,
          draft: policyResult.draft,
          kind: 'write_draft',
          toolCallId: toolCall.id,
          toolName: policyResult.draft.toolName,
        });
      }

      if (policyResult.kind === 'denied') {
        toolResults.push({
          ...traceMetadata,
          kind: 'denied',
          message: policyResult.message,
          toolCallId: toolCall.id,
          toolName: getEffectiveToolName(toolCall),
        });
      }
    }

    return { toolResults, writeDrafts };
  }

  private async loadMetaContext(
    request: SlackAgentProcessRequest,
  ): Promise<JsonRecord> {
    const context: JsonRecord = {};

    try {
      const toolCatalog = await this.policyGateway.callReadTool(
        'get_tool_catalog',
        {
          categories: ['DATABASE_CRUD'],
        },
      );

      context.toolCatalog = compactToolCatalogForRequest(
        toolCatalog,
        request.text,
      );
    } catch (error) {
      context.toolCatalogError =
        error instanceof Error ? error.message : 'Unknown MCP error';
    }

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

const findUnlearnedExecutableToolNames = (
  toolCalls: AgentToolCall[],
  learnedToolNames: Set<string>,
): string[] => {
  const toolNames = toolCalls
    .filter((toolCall) => {
      const toolName = getEffectiveToolName(toolCall);
      const classification = classifyToolName(toolName);

      return (
        (classification === 'read' || classification === 'write') &&
        !learnedToolNames.has(toolName)
      );
    })
    .map(getEffectiveToolName);

  return Array.from(new Set(toolNames));
};

const getEffectiveToolName = (toolCall: AgentToolCall): string => {
  if (
    toolCall.name === 'execute_tool' &&
    typeof toolCall.arguments?.toolName === 'string'
  ) {
    return toolCall.arguments.toolName;
  }

  return toolCall.name;
};

const getEffectiveToolArguments = (toolCall: AgentToolCall): JsonRecord => {
  if (
    toolCall.name === 'execute_tool' &&
    isJsonRecord(toolCall.arguments?.arguments)
  ) {
    return toolCall.arguments.arguments;
  }

  return toolCall.arguments ?? {};
};

const extractLearnedToolNames = (value: unknown): string[] => {
  const payload = unwrapMcpTextJson(value);

  if (!isJsonRecord(payload)) {
    return [];
  }

  const tools = payload.tools;

  if (!Array.isArray(tools)) {
    return [];
  }

  return tools.flatMap((tool) =>
    isJsonRecord(tool) && typeof tool.name === 'string' ? [tool.name] : [],
  );
};

const compactToolCatalogForRequest = (
  value: unknown,
  requestText: string | undefined,
): JsonRecord => {
  const payload = unwrapMcpTextJson(value);

  if (!isJsonRecord(payload) || !isJsonRecord(payload.catalog)) {
    return normalizeJsonRecord(value);
  }

  const wantedTerms = buildRelevantToolTerms(requestText);
  const compactCatalog: JsonRecord = {};
  let selectedCount = 0;
  let originalCount = 0;

  for (const [category, entries] of Object.entries(payload.catalog)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    const selectedEntries = entries.flatMap((entry) => {
      originalCount += 1;

      if (!isJsonRecord(entry) || typeof entry.name !== 'string') {
        return [];
      }

      const description =
        typeof entry.description === 'string' ? entry.description : '';
      const searchableText = `${entry.name} ${description}`.toLowerCase();
      const isRelevant = wantedTerms.some((term) =>
        searchableText.includes(term),
      );

      return isRelevant
        ? [
            {
              name: entry.name,
              description,
            },
          ]
        : [];
    });

    if (selectedEntries.length > 0) {
      selectedCount += selectedEntries.length;
      compactCatalog[category] = selectedEntries;
    }
  }

  return {
    catalog: compactCatalog,
    message: `Filtered CRM tool catalog to ${selectedCount} relevant tool(s) from ${originalCount}. Use learn_tools before executing any listed CRM read/write tool.`,
  };
};

const unwrapMcpTextJson = (value: unknown): unknown => {
  if (!isJsonRecord(value) || !Array.isArray(value.content)) {
    return value;
  }

  for (const contentItem of value.content) {
    if (!isJsonRecord(contentItem) || typeof contentItem.text !== 'string') {
      continue;
    }

    const parsedValue = parseJsonText(contentItem.text);

    if (parsedValue !== null) {
      return parsedValue;
    }
  }

  return value;
};

const buildRelevantToolTerms = (requestText: string | undefined): string[] => {
  const normalizedText = requestText?.toLowerCase() ?? '';
  const terms = new Set<string>([
    'company',
    'companies',
    'opportunit',
    'person',
    'people',
    'task',
    'note',
  ]);

  const addTerms = (patterns: string[], toolTerms: string[]) => {
    if (patterns.some((pattern) => normalizedText.includes(pattern))) {
      toolTerms.forEach((term) => terms.add(term));
    }
  };

  addTerms(['회사', '기업', '고객사', 'account', 'vendor', '벤더'], [
    'company',
    'companies',
  ]);
  addTerms(['연락처', '담당자', '사람', 'contact'], ['person', 'people']);
  addTerms(['영업', '기회', '딜', 'deal', 'pipeline', '파이프라인'], [
    'opportunit',
  ]);
  addTerms(['할 일', '할일', '태스크', '업무', 'task'], ['task']);
  addTerms(['노트', '메모', '활동', 'activity', 'note'], ['note', 'activity']);

  return Array.from(terms);
};

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

const sanitizeWorkerErrorMessage = (errorMessage: string): string => {
  if (errorMessage.includes('invalid_json_schema')) {
    return 'Codex output schema was rejected by the model provider.';
  }

  if (errorMessage.toLowerCase().includes('timed out')) {
    return 'Codex CLI timed out while processing the CRM request.';
  }

  if (errorMessage.length > 2_000) {
    return `${errorMessage.slice(0, 2_000)}...`;
  }

  return errorMessage;
};
