import { describe, expect, it } from 'vitest';

import { postSlackChannelProcessResponse } from '../src/slack/response-url';
import type { JsonRecord, SlackAgentProcessResponse } from '../src/types';

describe('postSlackChannelProcessResponse', () => {
  it('posts completed mention responses back to the source Slack thread', async () => {
    const calls: Array<{ body: JsonRecord; headers: Record<string, string> }> =
      [];
    const fetchImplementation: typeof fetch = async (_input, init) => {
      calls.push({
        body: JSON.parse(String(init?.body)) as JsonRecord,
        headers: init?.headers as Record<string, string>,
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    };

    const result: SlackAgentProcessResponse = {
      assistantMessage: '다우데이타 회사를 찾았습니다.',
      status: 'completed',
      toolResults: [],
      writeDrafts: [],
    };

    await postSlackChannelProcessResponse({
      fetchImplementation,
      request: {
        slack: {
          channelId: 'C123',
          messageTs: '1712345678.000100',
          threadTs: '1712345678.000100',
        },
        slackAgentRequestId: 'request-123',
        text: '<@UAPP> 다우데이타 회사 찾아줘',
      },
      result,
      slackBotToken: 'xoxb-test-token',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBe('Bearer xoxb-test-token');
    expect(calls[0]?.body).toMatchObject({
      channel: 'C123',
      text: '다우데이타 회사를 찾았습니다.',
      thread_ts: '1712345678.000100',
      unfurl_links: false,
      unfurl_media: false,
    });
  });

  it('posts write approval buttons for mention-triggered write drafts', async () => {
    const calls: Array<{ body: JsonRecord }> = [];
    const fetchImplementation: typeof fetch = async (_input, init) => {
      calls.push({ body: JSON.parse(String(init?.body)) as JsonRecord });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    };

    await postSlackChannelProcessResponse({
      fetchImplementation,
      request: {
        slack: {
          channelId: 'C123',
          messageTs: '1712345678.000100',
        },
        slackAgentRequestId: 'request-123',
      },
      result: {
        assistantMessage: '회사 생성을 승인해 주세요.',
        metadata: { approvalIds: ['approval-123'] },
        status: 'needs_approval',
        toolResults: [],
        writeDrafts: [
          {
            approvalPolicy: 'slack_user_approval_required',
            arguments: { name: 'ABC 테스트' },
            createdAt: '2026-04-22T00:00:00.000Z',
            id: 'draft-123',
            status: 'pending_approval',
            toolName: 'create_company',
          },
        ],
      },
      slackBotToken: 'xoxb-test-token',
    });

    expect(calls).toHaveLength(1);

    const blocks = calls[0]?.body.blocks;

    expect(Array.isArray(blocks)).toBe(true);

    if (!Array.isArray(blocks)) {
      throw new Error('Expected Slack blocks');
    }

    expect(calls[0]?.body.text).toContain('CRM 변경 승인 필요');
    expect(blocks[1]).toMatchObject({
      type: 'actions',
      elements: [
        {
          action_id: 'slack_agent_approve',
          value: JSON.stringify({
            slackAgentApprovalId: 'approval-123',
            slackAgentRequestId: 'request-123',
          }),
        },
        {
          action_id: 'slack_agent_reject',
          value: JSON.stringify({
            slackAgentApprovalId: 'approval-123',
            slackAgentRequestId: 'request-123',
          }),
        },
      ],
    });
  });
});
