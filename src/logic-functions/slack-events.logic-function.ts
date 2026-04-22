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
    rawPayload: slackEvent.rawPayload,
  });

  await updateSlackAgentThreadLatestRequest({
    slackAgentThreadId,
    slackAgentRequestId,
  });

  const handoffResult = await handoffSlackAgentRequestToWorker({
    endpoint: 'process',
    slackAgentRequestId,
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

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTION_UNIVERSAL_IDENTIFIERS.slackEvents,
  name: 'slack-events',
  description: 'Receives Slack Events API callbacks and queues worker processing.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/slack/events',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: SLACK_FORWARDED_REQUEST_HEADERS,
  },
});
