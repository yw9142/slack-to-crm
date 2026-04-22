import {
  formBodyToJsonObject,
  getJsonObjectArrayField,
  getJsonObjectField,
  getStringField,
  isJsonObject,
  parseFormBody,
  parseJsonObject,
} from 'src/slack/payload';
import type {
  JsonObject,
  SlackApprovalDecision,
  SlackCommandPayload,
  SlackEventPayload,
  SlackInteractivityPayload,
} from 'src/slack/types';

export function parseSlackCommandPayload(body: unknown): SlackCommandPayload {
  const searchParams = parseFormBody(body);

  return {
    teamId: getFormValue(searchParams, 'team_id'),
    teamDomain: getFormValue(searchParams, 'team_domain'),
    channelId: getFormValue(searchParams, 'channel_id'),
    channelName: getFormValue(searchParams, 'channel_name'),
    userId: getFormValue(searchParams, 'user_id'),
    userName: getFormValue(searchParams, 'user_name'),
    command: getFormValue(searchParams, 'command'),
    text: getFormValue(searchParams, 'text'),
    responseUrl: getFormValue(searchParams, 'response_url'),
    triggerId: getFormValue(searchParams, 'trigger_id'),
    rawPayload: formBodyToJsonObject(searchParams),
  };
}

export function parseSlackEventPayload(body: unknown): SlackEventPayload {
  const payload = parseJsonObject(body);
  const slackType = getStringField(payload, 'type');

  if (slackType === 'url_verification') {
    return {
      kind: 'URL_VERIFICATION',
      challenge: getStringField(payload, 'challenge') ?? '',
      rawPayload: payload,
    };
  }

  if (slackType !== 'event_callback') {
    return {
      kind: 'UNSUPPORTED',
      slackType,
      rawPayload: payload,
    };
  }

  const event = getJsonObjectField(payload, 'event') ?? {};
  const eventSubtype = getStringField(event, 'subtype');
  const botId = getStringField(event, 'bot_id');
  const userId = getStringField(event, 'user');

  return {
    kind: 'EVENT_CALLBACK',
    teamId: getStringField(payload, 'team_id'),
    eventId: getStringField(payload, 'event_id'),
    channelId: getStringField(event, 'channel'),
    userId,
    text: getStringField(event, 'text'),
    slackMessageTs: getStringField(event, 'ts'),
    slackThreadTs: getStringField(event, 'thread_ts') ?? getStringField(event, 'ts'),
    eventType: getStringField(event, 'type'),
    isBotEvent: Boolean(botId) || eventSubtype === 'bot_message' || !userId,
    rawPayload: payload,
  };
}

export function parseSlackInteractivityPayload(
  body: unknown,
): SlackInteractivityPayload {
  const searchParams = parseFormBody(body);
  const payloadParameter = getFormValue(searchParams, 'payload');
  const payload = parseJsonObject(payloadParameter ?? body);
  const action = getJsonObjectArrayField(payload, 'actions')[0] ?? {};
  const actionValue = getStringField(action, 'value');
  const actionValuePayload = parseActionValuePayload(actionValue);
  const user = getJsonObjectField(payload, 'user');
  const team = getJsonObjectField(payload, 'team');
  const channel = getJsonObjectField(payload, 'channel');
  const message = getJsonObjectField(payload, 'message');
  const container = getJsonObjectField(payload, 'container');
  const actionId = getStringField(action, 'action_id');
  const decision = getApprovalDecision(actionId, actionValue);

  return {
    teamId: getStringField(team ?? payload, 'id') ?? getStringField(payload, 'team_id'),
    channelId:
      getStringField(channel ?? payload, 'id') ??
      getStringField(payload, 'channel_id'),
    channelName: getStringField(channel ?? payload, 'name'),
    userId: getStringField(user ?? payload, 'id') ?? getStringField(payload, 'user_id'),
    actionId,
    responseUrl: getStringField(payload, 'response_url'),
    slackMessageTs:
      getStringField(message ?? payload, 'ts') ??
      getStringField(container ?? payload, 'message_ts'),
    slackThreadTs:
      getStringField(container ?? payload, 'thread_ts') ??
      getStringField(message ?? payload, 'thread_ts') ??
      getStringField(message ?? payload, 'ts'),
    decision,
    slackAgentRequestId:
      getStringField(actionValuePayload, 'slackAgentRequestId') ??
      getStringField(actionValuePayload, 'slack_agent_request_id'),
    slackAgentApprovalId:
      getStringField(actionValuePayload, 'slackAgentApprovalId') ??
      getStringField(actionValuePayload, 'slack_agent_approval_id'),
    slackAgentThreadId:
      getStringField(actionValuePayload, 'slackAgentThreadId') ??
      getStringField(actionValuePayload, 'slack_agent_thread_id'),
    workerPayload: getJsonObjectField(actionValuePayload, 'workerPayload'),
    rawPayload: payload,
  };
}

export function parseAllowedSlackChannelIds(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((channelId) => channelId.trim())
    .filter((channelId) => channelId.length > 0);
}

export function isSlackChannelAllowed(
  channelId: string | undefined,
  allowedChannelIds = parseAllowedSlackChannelIds(
    process.env.SLACK_ALLOWED_CHANNEL_IDS,
  ),
): boolean {
  return (
    allowedChannelIds.length === 0 ||
    Boolean(channelId && allowedChannelIds.includes(channelId))
  );
}

function getFormValue(
  searchParams: URLSearchParams,
  fieldName: string,
): string | undefined {
  const value = searchParams.get(fieldName);

  return value === null || value === '' ? undefined : value;
}

function getApprovalDecision(
  actionId: string | undefined,
  actionValue: string | undefined,
): SlackApprovalDecision | undefined {
  const decisionSource = `${actionId ?? ''} ${actionValue ?? ''}`.toLowerCase();

  if (decisionSource.includes('reject')) {
    return 'REJECTED';
  }

  if (decisionSource.includes('approve')) {
    return 'APPROVED';
  }

  return undefined;
}

function parseActionValuePayload(actionValue: string | undefined): JsonObject {
  if (!actionValue) {
    return {};
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(actionValue) as unknown;
  } catch {
    return { slackAgentRequestId: actionValue };
  }

  if (isJsonObject(parsedValue)) {
    return parsedValue;
  }

  return {};
}
