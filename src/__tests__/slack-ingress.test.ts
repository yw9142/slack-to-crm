import { describe, expect, it } from 'vitest';

import approvalNavigationMenuItem from '../navigation-menu-items/slack-agent-approvals.navigation-menu-item';
import requestNavigationMenuItem from '../navigation-menu-items/slack-agent-requests.navigation-menu-item';
import threadNavigationMenuItem from '../navigation-menu-items/slack-agent-threads.navigation-menu-item';
import toolTraceNavigationMenuItem from '../navigation-menu-items/slack-agent-tool-traces.navigation-menu-item';
import slackCommandsLogicFunction from '../logic-functions/slack-commands.logic-function';
import slackEventsLogicFunction from '../logic-functions/slack-events.logic-function';
import slackInteractivityLogicFunction from '../logic-functions/slack-interactivity.logic-function';
import {
  parseSlackCommandPayload,
  parseSlackEventPayload,
  parseSlackInteractivityPayload,
} from '../slack/parsing';
import {
  jsonRouteResponse,
  slackAcknowledgementResponse,
} from '../slack/route-response';
import {
  createSlackSignature,
  verifySlackSignature,
} from '../slack/signature';
import { buildWorkerHandoffRequest } from '../slack/worker-handoff';
import approvalView from '../views/slack-agent-approval-index.view';
import requestView from '../views/slack-agent-request-index.view';
import threadView from '../views/slack-agent-thread-index.view';
import toolTraceView from '../views/slack-agent-tool-trace-index.view';

describe('Twenty app manifests', () => {
  it('should expose Slack ingress under app-specific public routes', () => {
    expect(slackCommandsLogicFunction.success).toBe(true);
    expect(slackEventsLogicFunction.success).toBe(true);
    expect(slackInteractivityLogicFunction.success).toBe(true);
    expect(
      slackCommandsLogicFunction.config.httpRouteTriggerSettings?.path,
    ).toBe('/slack-to-crm/commands');
    expect(slackEventsLogicFunction.config.httpRouteTriggerSettings?.path).toBe(
      '/slack-to-crm/events',
    );
    expect(
      slackInteractivityLogicFunction.config.httpRouteTriggerSettings?.path,
    ).toBe('/slack-to-crm/interactivity');
  });

  it('should define audit views and navigation menu items', () => {
    const views = [requestView, threadView, approvalView, toolTraceView];
    const navigationMenuItems = [
      requestNavigationMenuItem,
      threadNavigationMenuItem,
      approvalNavigationMenuItem,
      toolTraceNavigationMenuItem,
    ];

    for (const view of views) {
      expect(view.success).toBe(true);
      expect(view.config.fields?.length).toBeGreaterThan(0);
    }

    for (const navigationMenuItem of navigationMenuItems) {
      expect(navigationMenuItem.success).toBe(true);
      expect(navigationMenuItem.config.viewUniversalIdentifier).toBeTruthy();
    }
  });
});

describe('Slack Events route handler', () => {
  it('should answer URL verification challenges before signature checks', async () => {
    const response = await slackEventsLogicFunction.config.handler({
      body: {
        type: 'url_verification',
        token: 'legacy-verification-token',
        challenge: 'challenge-value',
      },
      headers: {},
      pathParameters: {},
      queryStringParameters: {},
      isBase64Encoded: false,
      requestContext: {
        http: {
          method: 'POST',
          path: '/s/slack-to-crm/events',
        },
      },
    });

    expect(response).toEqual({ challenge: 'challenge-value' });
  });
});

describe('Slack signature verification', () => {
  it('should verify valid Slack signatures and reject mismatches', () => {
    const signingSecret = 'test-signing-secret';
    const timestamp = '1712345678';
    const rawBody = 'token=abc&team_id=T123&channel_id=C123&text=hello';
    const signature = createSlackSignature({
      signingSecret,
      timestamp,
      rawBody,
    });

    expect(
      verifySlackSignature({
        signingSecret,
        timestamp,
        rawBody,
        signature,
        nowSeconds: 1712345680,
      }),
    ).toBe(true);
    expect(
      verifySlackSignature({
        signingSecret,
        timestamp,
        rawBody: `${rawBody}-tampered`,
        signature,
        nowSeconds: 1712345680,
      }),
    ).toBe(false);
  });

  it('should reject stale timestamps', () => {
    const signingSecret = 'test-signing-secret';
    const timestamp = '1712345678';
    const rawBody = 'token=abc';
    const signature = createSlackSignature({
      signingSecret,
      timestamp,
      rawBody,
    });

    expect(
      verifySlackSignature({
        signingSecret,
        timestamp,
        rawBody,
        signature,
        nowSeconds: 1712347000,
      }),
    ).toBe(false);
  });
});

describe('Slack route responses', () => {
  it('should return direct Twenty route response payloads', () => {
    expect(jsonRouteResponse(401, { ok: false })).toEqual({ ok: false });
    expect(slackAcknowledgementResponse('queued')).toEqual({
      response_type: 'ephemeral',
      text: 'queued',
    });
  });
});

describe('Slack command parsing', () => {
  it('should parse Slack slash command form bodies', () => {
    const body = new URLSearchParams({
      team_id: 'T123',
      team_domain: 'acme',
      channel_id: 'C123',
      channel_name: 'sales',
      user_id: 'U123',
      user_name: 'ada',
      command: '/crm',
      text: 'find acme',
      response_url: 'https://hooks.slack.com/commands/123',
      trigger_id: 'trigger-123',
    }).toString();

    const payload = parseSlackCommandPayload(body);

    expect(payload).toMatchObject({
      teamId: 'T123',
      channelId: 'C123',
      channelName: 'sales',
      userId: 'U123',
      command: '/crm',
      text: 'find acme',
    });
    expect(payload.rawPayload).toMatchObject({
      team_id: 'T123',
      channel_id: 'C123',
    });
  });
});

describe('Slack event parsing', () => {
  it('should parse Slack message event callbacks', () => {
    const payload = parseSlackEventPayload(
      JSON.stringify({
        type: 'event_callback',
        team_id: 'T123',
        event_id: 'Ev123',
        event: {
          type: 'message',
          channel: 'C123',
          user: 'U123',
          text: 'Create a task for Acme',
          ts: '1712345678.000100',
        },
      }),
    );

    expect(payload).toMatchObject({
      kind: 'EVENT_CALLBACK',
      teamId: 'T123',
      eventId: 'Ev123',
      channelId: 'C123',
      userId: 'U123',
      text: 'Create a task for Acme',
      slackMessageTs: '1712345678.000100',
      slackThreadTs: '1712345678.000100',
      isBotEvent: false,
    });
  });

  it('should parse Slack URL verification payloads', () => {
    const payload = parseSlackEventPayload(
      JSON.stringify({
        type: 'url_verification',
        challenge: 'challenge-value',
      }),
    );

    expect(payload).toMatchObject({
      kind: 'URL_VERIFICATION',
      challenge: 'challenge-value',
    });
  });
});

describe('Slack approval interactivity parsing', () => {
  it('should parse approval button payload values', () => {
    const payloadValue = JSON.stringify({
      slackAgentRequestId: 'request-123',
      slackAgentApprovalId: 'approval-123',
      slackAgentThreadId: 'thread-123',
      workerPayload: { apply: true },
    });
    const body = new URLSearchParams({
      payload: JSON.stringify({
        type: 'block_actions',
        team: { id: 'T123' },
        channel: { id: 'C123', name: 'sales' },
        user: { id: 'U123' },
        actions: [{ action_id: 'slack_agent_approve', value: payloadValue }],
        message: { ts: '1712345678.000100' },
      }),
    }).toString();

    const payload = parseSlackInteractivityPayload(body);

    expect(payload).toMatchObject({
      teamId: 'T123',
      channelId: 'C123',
      userId: 'U123',
      decision: 'APPROVED',
      slackAgentRequestId: 'request-123',
      slackAgentApprovalId: 'approval-123',
      slackAgentThreadId: 'thread-123',
      workerPayload: { apply: true },
    });
  });
});

describe('Worker handoff request shape', () => {
  it('should build process handoff requests with shared-secret auth', () => {
    const request = buildWorkerHandoffRequest({
      endpoint: 'process',
      responseUrl: 'https://hooks.slack.com/commands/123',
      slack: { channelId: 'C123', teamId: 'T123', userId: 'U123' },
      slackAgentRequestId: 'request-123',
      text: 'find acme',
      workerBaseUrl: 'https://worker.example',
      workerSharedSecret: 'shared-secret',
    });
    const headers = request.init.headers as Record<string, string>;

    expect(request.url).toBe(
      'https://worker.example/internal/slack-agent/process',
    );
    expect(request.init.method).toBe('POST');
    expect(headers.authorization).toBe('Bearer shared-secret');
    expect(headers['x-slack-agent-shared-secret']).toBe('shared-secret');
    expect(request.init.body).toBe(
      JSON.stringify({
        slackAgentRequestId: 'request-123',
        text: 'find acme',
        responseUrl: 'https://hooks.slack.com/commands/123',
        slack: { channelId: 'C123', teamId: 'T123', userId: 'U123' },
      }),
    );
  });

  it('should include Slack bot token only when event replies need Web API posting', () => {
    const request = buildWorkerHandoffRequest({
      endpoint: 'process',
      slack: {
        channelId: 'C123',
        messageTs: '1712345678.000100',
        threadTs: '1712345678.000100',
      },
      slackAgentRequestId: 'request-123',
      slackBotToken: 'xoxb-test-token',
      text: '다우데이타 회사 찾아줘',
      workerBaseUrl: 'https://worker.example',
      workerSharedSecret: 'shared-secret',
    });

    expect(request.init.body).toBe(
      JSON.stringify({
        slackAgentRequestId: 'request-123',
        text: '다우데이타 회사 찾아줘',
        slackBotToken: 'xoxb-test-token',
        slack: {
          channelId: 'C123',
          messageTs: '1712345678.000100',
          threadTs: '1712345678.000100',
        },
      }),
    );
  });
});
