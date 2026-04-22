import {
  defineLogicFunction,
  HTTPMethod,
  type RoutePayload,
} from 'twenty-sdk/define';

import { LOGIC_FUNCTION_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';
import { isSlackChannelAllowed, parseSlackEventPayload } from 'src/slack/parsing';
import {
  jsonRouteResponse,
  textRouteResponse,
  type RouteResponse,
} from 'src/slack/route-response';
import {
  SLACK_FORWARDED_REQUEST_HEADERS,
  verifySlackRouteSignature,
} from 'src/slack/route-security';
import {
  createSlackAgentRequestRecord,
  createSlackAgentThreadRecord,
  updateSlackAgentRequestStatus,
  updateSlackAgentThreadLatestRequest,
} from 'src/slack/twenty-records';
import { handoffSlackAgentRequestToWorker } from 'src/slack/worker-handoff';

const handler = async (event: RoutePayload<unknown>): Promise<RouteResponse> => {
  const signatureResult = verifySlackRouteSignature(event);

  if (!signatureResult.ok) {
    return jsonRouteResponse(signatureResult.statusCode, {
      ok: false,
      error: signatureResult.message,
    });
  }

  const slackEvent = parseSlackEventPayload(event.body);

  if (slackEvent.kind === 'URL_VERIFICATION') {
    return textRouteResponse(200, slackEvent.challenge);
  }

  if (slackEvent.kind === 'UNSUPPORTED' || slackEvent.isBotEvent) {
    return jsonRouteResponse(200, { ok: true, ignored: true });
  }

  if (!isSlackChannelAllowed(slackEvent.channelId)) {
    return jsonRouteResponse(200, {
      ok: true,
      ignored: true,
      reason: 'channel_not_allowed',
    });
  }

  const normalizedText = normalizeMentionText(slackEvent.text);
  const slackAgentThreadId = await createSlackAgentThreadRecord({
    slackTeamId: slackEvent.teamId,
    slackChannelId: slackEvent.channelId,
    slackThreadTs: slackEvent.slackThreadTs,
    latestSlackMessageTs: slackEvent.slackMessageTs,
  });
  const slackAgentRequestId = await createSlackAgentRequestRecord({
    source: 'EVENT',
    slackAgentThreadId,
    slackTeamId: slackEvent.teamId,
    slackChannelId: slackEvent.channelId,
    slackThreadTs: slackEvent.slackThreadTs,
    slackMessageTs: slackEvent.slackMessageTs,
    slackUserId: slackEvent.userId,
    text: slackEvent.text,
    normalizedText,
    rawPayload: slackEvent.rawPayload,
  });

  await updateSlackAgentThreadLatestRequest({
    slackAgentThreadId,
    slackAgentRequestId,
  });

  const handoffResult = await handoffSlackAgentRequestToWorker({
    endpoint: 'process',
    context: { slackAgentThreadId },
    slack: {
      channelId: slackEvent.channelId,
      messageTs: slackEvent.slackMessageTs,
      teamId: slackEvent.teamId,
      threadTs: slackEvent.slackThreadTs,
      userId: slackEvent.userId,
    },
    slackAgentRequestId,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    text: normalizedText,
  });

  if (!handoffResult.ok) {
    await updateSlackAgentRequestStatus({
      slackAgentRequestId,
      status: 'HANDOFF_FAILED',
      errorMessage: handoffResult.errorMessage,
    });
  }

  return jsonRouteResponse(200, {
    ok: true,
    slackAgentRequestId,
    handoffOk: handoffResult.ok,
  });
};

const normalizeMentionText = (text: string | undefined): string | undefined => {
  const normalizedText = text?.replace(/^(?:<@[A-Z0-9]+>\s*)+/u, '').trim();

  return normalizedText && normalizedText.length > 0 ? normalizedText : text;
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTION_UNIVERSAL_IDENTIFIERS.slackEvents,
  name: 'slack-events',
  description: 'Receives Slack Events API callbacks and queues worker processing.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/slack-to-crm/events',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: SLACK_FORWARDED_REQUEST_HEADERS,
  },
});
