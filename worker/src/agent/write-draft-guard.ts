import type { AgentPromptProfile } from './core-parity-profiles';
import type { SlackAgentProcessRequest } from '../types';

const WRITE_PROFILES = new Set<AgentPromptProfile>([
  'crm-create',
  'crm-update',
  'crm-delete',
  'crm-bulk-write',
]);

const WRITE_INTENT_PATTERNS = [
  'create',
  'update',
  'delete',
  'remove',
  'add ',
  'save',
  'apply',
  'write',
  'draft',
  'approve',
  '생성',
  '추가',
  '등록',
  '만들',
  '작성',
  '구축',
  '설정',
  '수정',
  '변경',
  '삭제',
  '제거',
  '반영',
  '저장',
  '입력',
  '기록',
  '남겨',
  '승인',
];

const APPROVAL_DRAFT_CLAIM_PATTERNS = [
  'approval draft',
  'approval-ready',
  'pending approval',
  'approval required',
  'not applied',
  '승인 초안',
  '승인 요청',
  '승인 필요',
  '승인 대기',
  '승인 시',
  '승인하면',
  '승인 전',
  '아직 실제 반영하지',
  '실제 반영하지',
  '반영 초안',
  '반영될 변경',
  '변경 승인',
  'crm 반영 초안',
];

export const shouldRetryMissingWriteDraft = ({
  assistantMessage,
  profile,
  request,
  writeDraftCount,
}: {
  assistantMessage: string;
  profile: AgentPromptProfile;
  request: SlackAgentProcessRequest;
  writeDraftCount: number;
}): boolean =>
  writeDraftCount === 0 &&
  hasWriteIntent(profile, request.text) &&
  claimsApprovalDraft(assistantMessage);

export const buildMissingWriteDraftRetryPrompt = ({
  assistantMessage,
  originalPrompt,
}: {
  assistantMessage: string;
  originalPrompt: string;
}): string =>
  [
    originalPrompt,
    '## Critical Retry: Missing Slack Approval Draft',
    'Your previous final answer described a CRM approval draft, but the policy MCP session captured zero write drafts.',
    'That means Slack cannot show approval/cancel buttons and the CRM change cannot be applied.',
    '',
    'Retry the task now with this mandatory rule:',
    '- If the user requested CRM create/update/delete/write/apply/save/record/반영/저장/입력, you MUST call execute_tool for every concrete write action that should be approved.',
    '- The policy MCP will turn create_*, update_*, delete_*, create_many_*, update_many_*, and delete_* into approval drafts.',
    '- If several CRM writes are needed, call execute_tool several times. They will be bundled into one Slack approval.',
    '- If the target record, scope, or required fields are ambiguous, ask a clarification instead.',
    '- Do not output another approval summary unless execute_tool returned approvalRequired/write draft results.',
    '',
    'Previous invalid final answer:',
    '```text',
    assistantMessage.slice(0, 12_000),
    '```',
  ].join('\n');

export const buildMissingWriteDraftErrorMessage = (): string =>
  'CRM 승인 초안 생성에 실패했습니다. 쓰기 요청처럼 답변했지만 실제 Slack approval draft가 생성되지 않아 CRM에는 반영하지 않았습니다.';

const hasWriteIntent = (
  profile: AgentPromptProfile,
  text: string | undefined,
): boolean => {
  if (WRITE_PROFILES.has(profile)) {
    return true;
  }

  const normalizedText = normalizeText(text);

  return WRITE_INTENT_PATTERNS.some((pattern) =>
    normalizedText.includes(pattern.toLowerCase()),
  );
};

const claimsApprovalDraft = (assistantMessage: string): boolean => {
  const normalizedMessage = normalizeText(assistantMessage);

  return APPROVAL_DRAFT_CLAIM_PATTERNS.some((pattern) =>
    normalizedMessage.includes(pattern.toLowerCase()),
  );
};

const normalizeText = (value: string | undefined): string =>
  (value ?? '').toLowerCase();
