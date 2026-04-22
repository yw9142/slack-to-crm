import {
  defineLogicFunction,
  HTTPMethod,
  type RoutePayload,
} from 'twenty-sdk/define';

import { LOGIC_FUNCTION_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';
import {
  isSlackChannelAllowed,
  parseSlackInteractivityPayload,
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
  updateSlackAgentApprovalDecisionRecord,
  updateSlackAgentRequestStatus,
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

  const interactivity = parseSlackInteractivityPayload(event.body);

  if (!isSlackChannelAllowed(interactivity.channelId)) {
    return slackAcknowledgementResponse(
      'This Slack channel is not enabled for CRM agent approvals.',
    );
  }

  if (
    !interactivity.decision ||
    !interactivity.slackAgentRequestId ||
    !interactivity.slackAgentApprovalId
  ) {
    return slackAcknowledgementResponse('Invalid CRM agent approval action.');
  }

  await updateSlackAgentApprovalDecisionRecord({
    slackAgentApprovalId: interactivity.slackAgentApprovalId,
    slackAgentRequestId: interactivity.slackAgentRequestId,
    slackAgentThreadId: interactivity.slackAgentThreadId,
    slackApproverUserId: interactivity.userId,
    slackActionId: interactivity.actionId,
    status: interactivity.decision,
    workerPayload: interactivity.workerPayload,
    rawPayload: interactivity.rawPayload,
  });
  await updateSlackAgentRequestStatus({
    slackAgentRequestId: interactivity.slackAgentRequestId,
    status: interactivity.decision,
  });

  if (interactivity.decision === 'REJECTED') {
    return slackAcknowledgementResponse('CRM agent change rejected.');
  }

  const handoffResult = await handoffSlackAgentRequestToWorker({
    endpoint: 'apply',
    approvedBySlackUserId: interactivity.userId,
    responseUrl: interactivity.responseUrl,
    slackAgentRequestId: interactivity.slackAgentRequestId,
    slackAgentApprovalId: interactivity.slackAgentApprovalId,
    workerPayload: interactivity.workerPayload,
  });

  if (!handoffResult.ok) {
    await updateSlackAgentApprovalDecisionRecord({
      slackAgentApprovalId: interactivity.slackAgentApprovalId,
      slackAgentRequestId: interactivity.slackAgentRequestId,
      slackAgentThreadId: interactivity.slackAgentThreadId,
      slackApproverUserId: interactivity.userId,
      slackActionId: interactivity.actionId,
      status: 'APPLY_FAILED',
      workerPayload: interactivity.workerPayload,
      rawPayload: interactivity.rawPayload,
    });
    await updateSlackAgentRequestStatus({
      slackAgentRequestId: interactivity.slackAgentRequestId,
      status: 'HANDOFF_FAILED',
      errorMessage: handoffResult.errorMessage,
    });

    return slackAcknowledgementResponse(
      'Approval recorded, but the CRM agent worker apply handoff failed.',
    );
  }

  return slackAcknowledgementResponse('CRM agent change approved.');
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTION_UNIVERSAL_IDENTIFIERS.slackInteractivity,
  name: 'slack-interactivity',
  description: 'Receives Slack approval button callbacks for agent requests.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/slack/interactivity',
    httpMethod: HTTPMethod.POST,
    isAuthRequired: false,
    forwardedRequestHeaders: SLACK_FORWARDED_REQUEST_HEADERS,
  },
});
