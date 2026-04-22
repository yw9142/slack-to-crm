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
]);

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
    const classification = classifyToolName(toolCall.name);
    const toolArguments = toolCall.arguments ?? {};

    if (classification === 'read' || classification === 'meta') {
      const result = await this.readMcpClient.callTool(
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
    const result = await this.writeMcpClient.callTool('execute_tool', {
      approvalId: input.approvalId,
      approvedAt: this.now().toISOString(),
      approvedBySlackUserId: input.approvedBySlackUserId,
      arguments: input.draft.arguments,
      draftId: input.draft.id,
      toolName: input.draft.toolName,
    });

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
    return this.readMcpClient.callTool(toolName, toolArguments);
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
}
