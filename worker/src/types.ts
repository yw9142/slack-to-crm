export type JsonRecord = Record<string, unknown>;

export type SlackAgentContext = {
  teamId?: string;
  channelId?: string;
  userId?: string;
  messageTs?: string;
  threadTs?: string;
};

export type AgentToolCall = {
  id?: string;
  name: string;
  arguments?: JsonRecord;
  reason?: string;
};

export type SlackAgentProcessRequest = {
  slackAgentRequestId: string;
  requestId?: string;
  slack?: SlackAgentContext;
  text?: string;
  responseUrl?: string;
  context?: JsonRecord;
  toolCalls?: AgentToolCall[];
};

export type WriteDraft = {
  id: string;
  toolName: string;
  arguments: JsonRecord;
  createdAt: string;
  reason?: string;
  status: 'pending_approval';
  approvalPolicy: 'slack_user_approval_required';
};

export type ToolExecutionRecord = {
  durationMs?: number;
  errorMessage?: string;
  errorHint?: string;
  finishedAt?: string;
  input?: JsonRecord;
  policySessionId?: string;
  promptProfile?: string;
  retryCount?: number;
  toolCallId?: string;
  toolName: string;
  kind: 'read' | 'meta' | 'write_draft' | 'denied' | 'applied';
  result?: unknown;
  draft?: WriteDraft;
  message?: string;
  startedAt?: string;
};

export type AgentRunStatus = 'completed' | 'needs_approval';

export type SlackAgentProcessResponse = {
  status: AgentRunStatus;
  assistantMessage: string;
  writeDrafts: WriteDraft[];
  toolResults: ToolExecutionRecord[];
  metadata?: JsonRecord;
};

export type SlackAgentApplyRequest = {
  slackAgentRequestId?: string;
  slackAgentApprovalId?: string;
  draft?: WriteDraft;
  approvedBySlackUserId?: string;
  approvalId?: string;
  responseUrl?: string;
};

export type SlackAgentApplyResponse = {
  status: 'applied';
  draftId: string;
  toolName: 'execute_tool';
  result: unknown;
  results?: Array<{
    draftId: string;
    result: unknown;
  }>;
};

export const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
