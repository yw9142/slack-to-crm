import { randomUUID } from 'node:crypto';

import type { McpToolCallResult, TwentyMcpToolClient } from '../mcp/types';
import type {
  AgentToolCall,
  JsonRecord,
  WriteDraft,
  WriteDraftLinkTarget,
} from '../types';

const READ_TOOL_PREFIXES = ['find_', 'find_one_', 'group_by_'] as const;
const WRITE_TOOL_PREFIXES = [
  'create_',
  'create_many_',
  'update_',
  'update_many_',
  'delete_',
] as const;
const META_TOOL_NAMES = new Set([
  'get_tool_catalog',
  'learn_tools',
  'load_skills',
  'search_help_center',
]);
const EXECUTE_TOOL_NAME = 'execute_tool';

export type ToolClassification = 'read' | 'meta' | 'write' | 'denied';

export type ToolPolicyGatewayOptions = {
  readMcpClient: TwentyMcpToolClient;
  writeMcpClient: TwentyMcpToolClient;
  createDraftId?: () => string;
  now?: () => Date;
};

export type ToolPolicyGatewayResult =
  | {
      kind: 'tool_result';
      classification: 'read' | 'meta';
      toolCall: AgentToolCall;
      result: McpToolCallResult;
    }
  | {
      kind: 'write_draft';
      toolCall: AgentToolCall;
      draft: WriteDraft;
    }
  | {
      kind: 'denied';
      toolCall: AgentToolCall;
      message: string;
    };

export type ApplyApprovedDraftInput = {
  draft: WriteDraft;
  approvedBySlackUserId: string;
  approvalId?: string;
};

export type ApplyApprovedDraftResult = {
  draftId: string;
  toolName: 'execute_tool';
  result: McpToolCallResult;
};

export const classifyToolName = (toolName: string): ToolClassification => {
  if (META_TOOL_NAMES.has(toolName)) {
    return 'meta';
  }

  if (READ_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix))) {
    return 'read';
  }

  if (WRITE_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix))) {
    return 'write';
  }

  return 'denied';
};

export class ToolPolicyGateway {
  private readonly readMcpClient: TwentyMcpToolClient;
  private readonly writeMcpClient: TwentyMcpToolClient;
  private readonly createDraftId: () => string;
  private readonly now: () => Date;

  public constructor(options: ToolPolicyGatewayOptions) {
    this.readMcpClient = options.readMcpClient;
    this.writeMcpClient = options.writeMcpClient;
    this.createDraftId = options.createDraftId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  public async executeToolCall(
    toolCall: AgentToolCall,
  ): Promise<ToolPolicyGatewayResult> {
    if (toolCall.name === EXECUTE_TOOL_NAME) {
      return this.executeCoreStyleToolCall(toolCall);
    }

    const classification = classifyToolName(toolCall.name);
    const toolArguments = toolCall.arguments ?? {};

    if (classification === 'meta') {
      const result = await this.readMcpClient.callTool(toolCall.name, toolArguments);

      return {
        classification,
        kind: 'tool_result',
        result,
        toolCall,
      };
    }

    if (classification === 'read') {
      const result = await this.executeTwentyTool(
        this.readMcpClient,
        toolCall.name,
        toolArguments,
      );

      return {
        classification,
        kind: 'tool_result',
        result,
        toolCall,
      };
    }

    if (classification === 'write') {
      return {
        draft: this.createWriteDraft(toolCall, toolArguments),
        kind: 'write_draft',
        toolCall,
      };
    }

    return {
      kind: 'denied',
      message: `Tool "${toolCall.name}" is not allowed by the worker policy`,
      toolCall,
    };
  }

  public async applyApprovedDraft(
    input: ApplyApprovedDraftInput,
  ): Promise<ApplyApprovedDraftResult> {
    this.validateApprovedDraft(input.draft);

    const result = await this.executeTwentyTool(
      this.writeMcpClient,
      input.draft.toolName,
      input.draft.arguments,
    );

    return {
      draftId: input.draft.id,
      result,
      toolName: 'execute_tool',
    };
  }

  public async applyApprovedDraftWithRelations(
    input: ApplyApprovedDraftInput,
  ): Promise<ApplyApprovedDraftResult[]> {
    const primaryResult = await this.applyApprovedDraft(input);
    const relationResults = await this.applyPostCreateLinkTargets({
      draft: input.draft,
      primaryResult: primaryResult.result,
    });

    return [primaryResult, ...relationResults];
  }

  public callReadTool(
    toolName: string,
    toolArguments: JsonRecord = {},
  ): Promise<McpToolCallResult> {
    const classification = classifyToolName(toolName);

    if (classification === 'meta') {
      return this.readMcpClient.callTool(toolName, toolArguments);
    }

    return this.executeTwentyTool(this.readMcpClient, toolName, toolArguments);
  }

  public callSystemWriteTool(
    toolName: string,
    toolArguments: JsonRecord = {},
  ): Promise<McpToolCallResult> {
    return this.executeTwentyTool(this.writeMcpClient, toolName, toolArguments);
  }

  private createWriteDraft(
    toolCall: AgentToolCall,
    toolArguments: JsonRecord,
  ): WriteDraft {
    const normalizedWriteInput = extractInlineLinkTargets(
      toolCall.name,
      toolArguments,
    );

    return {
      approvalPolicy: 'slack_user_approval_required',
      arguments: normalizedWriteInput.arguments,
      createdAt: this.now().toISOString(),
      id: this.createDraftId(),
      ...(normalizedWriteInput.linkTargets.length > 0
        ? { linkTargets: normalizedWriteInput.linkTargets }
        : {}),
      reason: toolCall.reason,
      status: 'pending_approval',
      toolName: toolCall.name,
    };
  }

  private validateApprovedDraft(draft: WriteDraft): void {
    if (draft.status !== 'pending_approval') {
      throw new Error(`Cannot apply draft ${draft.id}: draft is not pending`);
    }

    if (classifyToolName(draft.toolName) !== 'write') {
      throw new Error(
        `Cannot apply draft ${draft.id}: ${draft.toolName} is not a write tool`,
      );
    }

    if (
      draft.toolName.startsWith('update_many_') &&
      !isJsonRecord(draft.arguments.filter)
    ) {
      throw new Error(
        `Cannot apply draft ${draft.id}: bulk update requires a filter`,
      );
    }

    if (
      draft.toolName.startsWith('create_many_') &&
      !Array.isArray(draft.arguments.records)
    ) {
      throw new Error(
        `Cannot apply draft ${draft.id}: bulk create requires records`,
      );
    }
  }

  private async applyPostCreateLinkTargets({
    draft,
    primaryResult,
  }: {
    draft: WriteDraft;
    primaryResult: McpToolCallResult;
  }): Promise<ApplyApprovedDraftResult[]> {
    const linkTargets = normalizeLinkTargets(draft.linkTargets);
    const relationConfig = getRelationConfigForDraft(draft.toolName);

    if (!relationConfig || linkTargets.length === 0) {
      return [];
    }

    const createdRecordIds = extractCreatedRecordIds(primaryResult);

    if (createdRecordIds.length === 0) {
      return [
        {
          draftId: `${draft.id}:link-targets-missing-created-id`,
          result: {
            content: [
              {
                text: JSON.stringify({
                  error:
                    'Primary create result did not include created record ids, so relation target records were not created.',
                  linkTargets,
                  toolName: draft.toolName,
                }),
                type: 'text',
              },
            ],
            isError: true,
          },
          toolName: 'execute_tool',
        },
      ];
    }

    const relationRecords = createdRecordIds.flatMap((createdRecordId) =>
      linkTargets.map((linkTarget) => ({
        [toRelationTargetIdFieldName(linkTarget.targetFieldName)]:
          linkTarget.targetRecordId,
        [relationConfig.sourceIdFieldName]: createdRecordId,
        position: linkTarget.position ?? 'first',
      })),
    );
    const applyResults: ApplyApprovedDraftResult[] = [];

    for (const [chunkIndex, records] of chunkArray(
      relationRecords,
      20,
    ).entries()) {
      const result = await this.executeTwentyTool(
        this.writeMcpClient,
        relationConfig.createManyToolName,
        { records },
      );

      applyResults.push({
        draftId: `${draft.id}:link-targets:${chunkIndex + 1}`,
        result,
        toolName: 'execute_tool',
      });
    }

    return applyResults;
  }

  private async executeCoreStyleToolCall(
    toolCall: AgentToolCall,
  ): Promise<ToolPolicyGatewayResult> {
    const toolName =
      typeof toolCall.arguments?.toolName === 'string'
        ? toolCall.arguments.toolName
        : undefined;
    const toolArguments = isJsonRecord(toolCall.arguments?.arguments)
      ? toolCall.arguments.arguments
      : {};

    if (!toolName) {
      return {
        kind: 'denied',
        message: 'execute_tool requires a toolName string',
        toolCall,
      };
    }

    const classification = classifyToolName(toolName);

    if (classification === 'read') {
      const result = await this.executeTwentyTool(
        this.readMcpClient,
        toolName,
        toolArguments,
      );

      return {
        classification,
        kind: 'tool_result',
        result,
        toolCall,
      };
    }

    if (classification === 'meta') {
      const result = await this.readMcpClient.callTool(toolName, toolArguments);

      return {
        classification,
        kind: 'tool_result',
        result,
        toolCall,
      };
    }

    if (classification === 'write') {
      return {
        draft: this.createWriteDraft(
          {
            ...toolCall,
            arguments: toolArguments,
            name: toolName,
          },
          toolArguments,
        ),
        kind: 'write_draft',
        toolCall,
      };
    }

    return {
      kind: 'denied',
      message: `execute_tool cannot run "${toolName}" through the worker policy`,
      toolCall,
    };
  }

  private executeTwentyTool(
    mcpClient: TwentyMcpToolClient,
    toolName: string,
    toolArguments: JsonRecord,
  ): Promise<McpToolCallResult> {
    return mcpClient.callTool('execute_tool', {
      arguments: toolArguments,
      toolName,
    });
  }
}

const isJsonRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeLinkTargets = (
  linkTargets: WriteDraft['linkTargets'],
): WriteDraftLinkTarget[] => {
  if (!Array.isArray(linkTargets)) {
    return [];
  }

  return linkTargets.flatMap((linkTarget) => {
    if (
      typeof linkTarget.targetFieldName !== 'string' ||
      typeof linkTarget.targetRecordId !== 'string' ||
      !linkTarget.targetFieldName.startsWith('target')
    ) {
      return [];
    }

    return [
      {
        ...(linkTarget.position === 'first' ||
        linkTarget.position === 'last' ||
        typeof linkTarget.position === 'number'
          ? { position: linkTarget.position }
          : {}),
        targetFieldName: linkTarget.targetFieldName,
        targetRecordId: linkTarget.targetRecordId,
      },
    ];
  });
};

const extractInlineLinkTargets = (
  toolName: string,
  toolArguments: JsonRecord,
): {
  arguments: JsonRecord;
  linkTargets: WriteDraftLinkTarget[];
} => {
  if (toolName !== 'create_note' && toolName !== 'create_task') {
    return {
      arguments: toolArguments,
      linkTargets: [],
    };
  }

  const linkTargets: WriteDraftLinkTarget[] = [];
  const normalizedArguments: JsonRecord = {};

  for (const [key, value] of Object.entries(toolArguments)) {
    if (
      key.startsWith('target') &&
      typeof value === 'string' &&
      value.length > 0
    ) {
      linkTargets.push({
        targetFieldName: key,
        targetRecordId: value,
      });
      continue;
    }

    if (key === 'linkTargets') {
      linkTargets.push(
        ...normalizeLinkTargets(value as WriteDraft['linkTargets']),
      );
      continue;
    }

    normalizedArguments[key] = value;
  }

  return {
    arguments: normalizedArguments,
    linkTargets,
  };
};

const getRelationConfigForDraft = (
  toolName: string,
):
  | {
      createManyToolName: 'create_many_note_targets' | 'create_many_task_targets';
      sourceIdFieldName: 'noteId' | 'taskId';
    }
  | undefined => {
  if (toolName === 'create_note' || toolName === 'create_many_notes') {
    return {
      createManyToolName: 'create_many_note_targets',
      sourceIdFieldName: 'noteId',
    };
  }

  if (toolName === 'create_task' || toolName === 'create_many_tasks') {
    return {
      createManyToolName: 'create_many_task_targets',
      sourceIdFieldName: 'taskId',
    };
  }

  return undefined;
};

const toRelationTargetIdFieldName = (targetFieldName: string): string =>
  targetFieldName.endsWith('Id') ? targetFieldName : `${targetFieldName}Id`;

const extractCreatedRecordIds = (value: unknown): string[] => {
  const ids = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (!isJsonRecord(candidate)) {
      return;
    }

    if (typeof candidate.id === 'string') {
      ids.add(candidate.id);
    }

    if (typeof candidate.recordId === 'string') {
      ids.add(candidate.recordId);
    }

    for (const nestedKey of ['result', 'record', 'records', 'data']) {
      const nestedValue = candidate[nestedKey];

      if (Array.isArray(nestedValue)) {
        nestedValue.forEach(visit);
      } else {
        visit(nestedValue);
      }
    }

    if (Array.isArray(candidate.recordReferences)) {
      candidate.recordReferences.forEach(visit);
    }

    if (Array.isArray(candidate.content)) {
      for (const contentItem of candidate.content) {
        if (
          !isJsonRecord(contentItem) ||
          typeof contentItem.text !== 'string'
        ) {
          continue;
        }

        try {
          visit(JSON.parse(contentItem.text) as unknown);
        } catch {
          // Ignore non-JSON text content.
        }
      }
    }
  };

  visit(value);

  return [...ids];
};

const chunkArray = <TValue>(
  values: TValue[],
  chunkSize: number,
): TValue[][] => {
  const chunks: TValue[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
};
