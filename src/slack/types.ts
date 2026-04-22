export type JsonObject = Record<string, unknown>;

export type SlackIngressSource = 'EVENT' | 'COMMAND' | 'INTERACTIVITY';

export type SlackAgentRequestStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'HANDOFF_FAILED';

export type SlackAgentApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLY_FAILED';

export type SlackApprovalDecision = 'APPROVED' | 'REJECTED';

export type SlackCommandPayload = {
  teamId?: string;
  teamDomain?: string;
  channelId?: string;
  channelName?: string;
  userId?: string;
  userName?: string;
  command?: string;
  text?: string;
  responseUrl?: string;
  triggerId?: string;
  rawPayload: JsonObject;
};

export type SlackUrlVerificationPayload = {
  kind: 'URL_VERIFICATION';
  challenge: string;
  rawPayload: JsonObject;
};

export type SlackEventCallbackPayload = {
  kind: 'EVENT_CALLBACK';
  teamId?: string;
  eventId?: string;
  channelId?: string;
  userId?: string;
  text?: string;
  slackMessageTs?: string;
  slackThreadTs?: string;
  eventType?: string;
  isBotEvent: boolean;
  rawPayload: JsonObject;
};

export type SlackUnsupportedEventPayload = {
  kind: 'UNSUPPORTED';
  slackType?: string;
  rawPayload: JsonObject;
};

export type SlackEventPayload =
  | SlackUrlVerificationPayload
  | SlackEventCallbackPayload
  | SlackUnsupportedEventPayload;

export type SlackInteractivityPayload = {
  teamId?: string;
  channelId?: string;
  channelName?: string;
  userId?: string;
  actionId?: string;
  responseUrl?: string;
  slackMessageTs?: string;
  slackThreadTs?: string;
  decision?: SlackApprovalDecision;
  slackAgentRequestId?: string;
  slackAgentApprovalId?: string;
  slackAgentThreadId?: string;
  workerPayload?: JsonObject;
  rawPayload: JsonObject;
};
