import { randomUUID } from 'node:crypto';

import type { McpToolCallResult, TwentyMcpToolClient } from '../mcp/types';
import type { AgentToolCall, JsonRecord, WriteDraft } from '../types';

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
    return {
      approvalPolicy: 'slack_user_approval_required',
      arguments: toolArguments,
      createdAt: this.now().toISOString(),
      id: this.createDraftId(),
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
