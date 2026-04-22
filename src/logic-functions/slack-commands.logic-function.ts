import {
  defineLogicFunction,
  HTTPMethod,
  type RoutePayload,
} from 'twenty-sdk/define';

import { LOGIC_FUNCTION_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';
import {
  isSlackChannelAllowed,
  parseSlackCommandPayload,
} from 'src/slack/parsing';
import {
  jsonRouteResponse,
  slackAcknowledgementResponse,
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

  const command = parseSlackCommandPayload(event.body);

  if (!isSlackChannelAllowed(command.channelId)) {
    return slackAcknowledgementResponse(
      'This Slack channel is not enabled for CRM agent requests.',
    );
  }

  const slackAgentThreadId = await createSlackAgentThreadRecord({
    slackTeamId: command.teamId,
    slackChannelId: command.channelId,
    slackChannelName: command.channelName,
  });
  const slackAgentRequestId = await createSlackAgentRequestRecord({
    source: 'COMMAND',
    slackAgentThreadId,
    slackTeamId: command.teamId,
    slackChannelId: command.channelId,
    slackChannelName: command.channelName,
    slackUserId: command.userId,
    slackUserName: command.userName,
    command: command.command,
    text: command.text,
    normalizedText: command.text,
    responseUrl: command.responseUrl,
    rawPayload: command.rawPayload,
  });

  await updateSlackAgentThreadLatestRequest({
    slackAgentThreadId,
    slackAgentRequestId,
  });

  const handoffResult = await handoffSlackAgentRequestToWorker({
    endpoint: 'process',
    context: { slackAgentThreadId },
    responseUrl: command.responseUrl,
    slack: {
      channelId: command.channelId,
      teamId: command.teamId,
      userId: command.userId,
    },
    slackAgentRequestId,
    text: command.text,
  });

  if (!handoffResult.ok) {
    await updateSlackAgentRequestStatus({
      slackAgentRequestId,
      status: 'HANDOFF_FAILED',
      errorMessage: handoffResult.errorMessage,
    });

    return slackAcknowledgementResponse(
      'Request saved, but the CRM agent worker handoff failed.',
    );
  }

  return slackAcknowledgementResponse('CRM agent request queued.');
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTION_UNIVERSAL_IDENTIFIERS.slackCommands,
  name: 'slack-commands',
  description: 'Receives Slack slash commands and queues worker processing.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/slack-to-crm/commands',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: SLACK_FORWARDED_REQUEST_HEADERS,
  },
});
