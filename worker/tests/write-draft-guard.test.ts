import { describe, expect, it } from 'vitest';

import {
  buildMissingWriteDraftRetryPrompt,
  shouldRetryMissingWriteDraft,
} from '../src/agent/write-draft-guard';

describe('write draft guard', () => {
  it('retries approval-like write answers that did not capture write drafts', () => {
    expect(
      shouldRetryMissingWriteDraft({
        assistantMessage:
          'CRM 반영 초안입니다. 아직 실제 반영하지 않았습니다. 승인 시 반영될 변경입니다.',
        profile: 'crm-update',
        request: {
          slackAgentRequestId: 'request-1',
          text: '미팅 내용 CRM에 반영해줘',
        },
        writeDraftCount: 0,
      }),
    ).toBe(true);
  });

  it('does not retry clarification answers without approval claims', () => {
    expect(
      shouldRetryMissingWriteDraft({
        assistantMessage: '대상 회사가 여러 개입니다. 어느 회사를 수정할까요?',
        profile: 'crm-update',
        request: {
          slackAgentRequestId: 'request-1',
          text: '회사 정보 수정해줘',
        },
        writeDraftCount: 0,
      }),
    ).toBe(false);
  });

  it('builds a retry prompt that forces actual execute_tool write calls', () => {
    const prompt = buildMissingWriteDraftRetryPrompt({
      assistantMessage: '승인 시 반영될 변경입니다.',
      originalPrompt: 'original prompt',
    });

    expect(prompt).toContain('zero write drafts');
    expect(prompt).toContain('MUST call execute_tool');
    expect(prompt).toContain('bundled into one Slack approval');
  });
});
