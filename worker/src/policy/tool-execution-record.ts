import type { AgentToolCall, JsonRecord, ToolExecutionRecord } from '../types';

export const isJsonRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const getEffectiveToolName = (toolCall: AgentToolCall): string => {
  if (
    toolCall.name === 'execute_tool' &&
    typeof toolCall.arguments?.toolName === 'string'
  ) {
    return toolCall.arguments.toolName;
  }

  return toolCall.name;
};

export const getEffectiveToolArguments = (
  toolCall: AgentToolCall,
): JsonRecord => {
  if (
    toolCall.name === 'execute_tool' &&
    isJsonRecord(toolCall.arguments?.arguments)
  ) {
    return toolCall.arguments.arguments;
  }

  return toolCall.arguments ?? {};
};

export const mapToolTraceStatus = (
  toolResult: ToolExecutionRecord,
): string => {
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

export const normalizeJsonRecord = (value: unknown): JsonRecord => {
  if (isJsonRecord(value)) {
    return value;
  }

  return { value };
};

export const sanitizeWorkerErrorMessage = (errorMessage: string): string => {
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
