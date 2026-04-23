import { describe, expect, it } from 'vitest';

import { buildCoreParityPrompt } from '../src/agent/core-parity-prompt';
import {
  getCatalogCategoriesForProfile,
  selectCoreParityProfile,
} from '../src/agent/core-parity-profiles';

describe('core parity prompt', () => {
  it('classifies CRM intents beyond read-only questions', () => {
    expect(selectCoreParityProfile('오늘 일일 영업 가이드 작성해줘')).toBe(
      'daily-sales-guide',
    );
    expect(selectCoreParityProfile('회사 다우데이타 생성해줘')).toBe(
      'crm-create',
    );
    expect(selectCoreParityProfile('이 기회 금액 수정해줘')).toBe('crm-update');
    expect(selectCoreParityProfile('미팅 내용 CRM에 반영해줘')).toBe(
      'crm-update',
    );
    expect(selectCoreParityProfile('중복 회사 여러 개 삭제해줘')).toBe(
      'crm-bulk-write',
    );
    expect(selectCoreParityProfile('파이프라인 대시보드 만들어줘')).toBe(
      'dashboard-or-reporting',
    );
    expect(selectCoreParityProfile('계약 만료 자동화 워크플로 만들어줘')).toBe(
      'workflow-or-automation',
    );
  });

  it('selects intent-specific catalog categories', () => {
    expect(getCatalogCategoriesForProfile('daily-sales-guide')).toEqual([
      'DATABASE_CRUD',
    ]);
    expect(getCatalogCategoriesForProfile('dashboard-or-reporting')).toEqual([
      'DATABASE_CRUD',
      'DASHBOARD',
      'VIEW',
      'VIEW_FIELD',
      'METADATA',
    ]);
    expect(getCatalogCategoriesForProfile('workflow-or-automation')).toEqual([
      'DATABASE_CRUD',
      'WORKFLOW',
      'ACTION',
      'LOGIC_FUNCTION',
    ]);
  });

  it('builds a core-style prompt with profile output contract and write policy', () => {
    const prompt = buildCoreParityPrompt({
      profile: 'daily-sales-guide',
      request: {
        slackAgentRequestId: 'request-1',
        text: '일일 영업 가이드',
      },
      runtime: {
        currentDateKst: '2026년 4월 23일 목요일',
        locale: 'ko-KR',
        timeZone: 'Asia/Seoul',
      },
    });

    expect(prompt).toContain('Plan -> Skill -> Learn -> Execute');
    expect(prompt).toContain('get_tool_catalog to discover tools');
    expect(prompt).toContain('Approval required');
    expect(prompt).toContain('Describing a draft in final text');
    expect(prompt).toContain('📊 일일 영업 가이드');
    expect(prompt).toContain('🎯 오늘 집중해야 할 딜');
    expect(prompt).toContain('"promptProfile": "daily-sales-guide"');
  });
});
