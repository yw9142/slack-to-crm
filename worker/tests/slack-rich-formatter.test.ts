import { describe, expect, it } from 'vitest';

import { formatSlackRichAnswer } from '../src/slack/slack-rich-formatter';

describe('formatSlackRichAnswer', () => {
  it('converts markdown tables into compact Slack bullets with KRW units', () => {
    const result = formatSlackRichAnswer(
      [
        '## 📊 파이프라인',
        '| 딜 | 회사 | 금액 | 단계 |',
        '| --- | --- | ---: | --- |',
        '| ERP 도입 | 다우데이타 | 120000000 | 제안 |',
        '| 보안 갱신 | ABC | 35000000원 | 협상 |',
      ].join('\n'),
    );

    expect(result).toBe(
      [
        '*📊 파이프라인*',
        '• *딜*: ERP 도입 · *회사*: 다우데이타 · *금액*: 1.2억 · *단계*: 제안',
        '• *딜*: 보안 갱신 · *회사*: ABC · *금액*: 3,500만원 · *단계*: 협상',
      ].join('\n'),
    );
  });

  it('moves 확인 필요 sections below the rest of the answer', () => {
    const result = formatSlackRichAnswer(
      [
        '### ⚠️ 확인 필요',
        '- 담당자 이메일은 CRM에서 찾지 못했습니다.',
        '',
        '## ✅ 요약',
        '요청한 회사 2건을 확인했습니다.',
      ].join('\n'),
    );

    expect(result).toBe(
      [
        '*✅ 요약*',
        '요청한 회사 2건을 확인했습니다.',
        '',
        '*⚠️ 확인 필요*',
        '- 담당자 이메일은 CRM에서 찾지 못했습니다.',
      ].join('\n'),
    );
  });

  it('only normalizes raw numbers when they are obvious KRW amounts', () => {
    const result = formatSlackRichAnswer(
      '고객 ID 120000000은 유지하고, 금액은 120000000입니다.',
    );

    expect(result).toBe('고객 ID 120000000은 유지하고, 금액은 1.2억입니다.');
  });

  it('does not normalize implausibly large raw values that are likely micros or IDs', () => {
    const result = formatSlackRichAnswer(
      'amountMicros 합계는 1754000000000000입니다.',
    );

    expect(result).toBe('amountMicros 합계는 1754000000000000입니다.');
  });

  it('does not alter markdown inside fenced code blocks', () => {
    const result = formatSlackRichAnswer(
      ['```', '| 금액 |', '| --- |', '| 120000000 |', '```'].join('\n'),
    );

    expect(result).toBe(
      ['```', '| 금액 |', '| --- |', '| 120000000 |', '```'].join('\n'),
    );
  });
});
