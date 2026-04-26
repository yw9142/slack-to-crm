export type AgentPromptProfile =
  | 'general-crm-answer'
  | 'daily-sales-guide'
  | 'crm-create'
  | 'crm-update'
  | 'crm-delete'
  | 'crm-bulk-write'
  | 'dashboard-or-reporting'
  | 'workflow-or-automation'
  | 'metadata-or-schema'
  | 'help-or-howto';

export type ToolCatalogCategory =
  | 'ACTION'
  | 'DASHBOARD'
  | 'DATABASE_CRUD'
  | 'LOGIC_FUNCTION'
  | 'METADATA'
  | 'VIEW'
  | 'VIEW_FIELD'
  | 'WORKFLOW';

const DAILY_SALES_PATTERNS = [
  '일일 영업',
  '영업 가이드',
  '영업가이드',
  '오늘 영업',
  '오늘 뭐',
  'daily sales',
  'sales guide',
];

const DASHBOARD_PATTERNS = [
  'dashboard',
  '대시보드',
  'report',
  '보고서',
  '차트',
  '그래프',
  '위젯',
  '시각화',
];

const WORKFLOW_PATTERNS = [
  'workflow',
  'automation',
  '워크플로',
  '워크플로우',
  '자동화',
  '트리거',
  'trigger',
];

const METADATA_PATTERNS = [
  'metadata',
  'schema',
  'object',
  'field',
  'view',
  '필드',
  '객체',
  '오브젝트',
  '스키마',
  '뷰',
  '컬럼',
  '속성',
];

const HELP_PATTERNS = [
  'help',
  'how to',
  '사용법',
  '방법',
  '설명해',
  '문서',
  'docs',
  '도움말',
];

const DELETE_PATTERNS = ['delete', '삭제', '지워', '제거', 'remove'];
const UPDATE_PATTERNS = [
  'update',
  '수정',
  '변경',
  '바꿔',
  '고쳐',
  '갱신',
  '반영',
  '저장',
  '입력',
  '기록',
  'patch',
];
const CREATE_PATTERNS = [
  'create',
  '생성',
  '추가',
  '등록',
  '만들',
  'add ',
  'new ',
];
const BULK_PATTERNS = [
  'bulk',
  'many',
  'batch',
  '대량',
  '여러',
  '전체',
  '일괄',
  '모두',
];

export const selectCoreParityProfile = (
  text: string | undefined,
): AgentPromptProfile => {
  const normalizedText = normalizeText(text);

  if (hasAny(normalizedText, DAILY_SALES_PATTERNS)) {
    return 'daily-sales-guide';
  }

  if (hasAny(normalizedText, DASHBOARD_PATTERNS)) {
    return 'dashboard-or-reporting';
  }

  if (hasAny(normalizedText, WORKFLOW_PATTERNS)) {
    return 'workflow-or-automation';
  }

  if (hasAny(normalizedText, METADATA_PATTERNS)) {
    return 'metadata-or-schema';
  }

  if (hasAny(normalizedText, HELP_PATTERNS)) {
    return 'help-or-howto';
  }

  const isBulk = hasAny(normalizedText, BULK_PATTERNS);

  if (
    isBulk &&
    (hasAny(normalizedText, CREATE_PATTERNS) ||
      hasAny(normalizedText, UPDATE_PATTERNS) ||
      hasAny(normalizedText, DELETE_PATTERNS))
  ) {
    return 'crm-bulk-write';
  }

  if (hasAny(normalizedText, DELETE_PATTERNS)) {
    return 'crm-delete';
  }

  if (hasAny(normalizedText, UPDATE_PATTERNS)) {
    return 'crm-update';
  }

  if (hasAny(normalizedText, CREATE_PATTERNS)) {
    return 'crm-create';
  }

  return 'general-crm-answer';
};

export const getCatalogCategoriesForProfile = (
  profile: AgentPromptProfile,
): ToolCatalogCategory[] => {
  switch (profile) {
    case 'dashboard-or-reporting':
      return ['DATABASE_CRUD', 'DASHBOARD', 'VIEW', 'VIEW_FIELD', 'METADATA'];
    case 'workflow-or-automation':
      return ['DATABASE_CRUD', 'WORKFLOW', 'ACTION', 'LOGIC_FUNCTION'];
    case 'metadata-or-schema':
      return ['METADATA', 'VIEW', 'VIEW_FIELD', 'DATABASE_CRUD'];
    case 'help-or-howto':
      return ['ACTION'];
    case 'crm-create':
    case 'crm-update':
    case 'crm-delete':
    case 'crm-bulk-write':
    case 'daily-sales-guide':
    case 'general-crm-answer':
      return ['DATABASE_CRUD'];
  }
};

export const getSkillHintsForProfile = (
  profile: AgentPromptProfile,
): string[] => {
  switch (profile) {
    case 'dashboard-or-reporting':
      return ['dashboard-building', 'data-manipulation'];
    case 'workflow-or-automation':
      return ['workflow-building'];
    case 'metadata-or-schema':
      return ['metadata-building', 'view-building'];
    case 'crm-create':
    case 'crm-update':
    case 'crm-delete':
    case 'crm-bulk-write':
    case 'daily-sales-guide':
    case 'general-crm-answer':
      return ['data-manipulation'];
    case 'help-or-howto':
      return [];
  }
};

export const buildProfileInstructions = (
  profile: AgentPromptProfile,
): string => {
  switch (profile) {
    case 'daily-sales-guide':
      return DAILY_SALES_GUIDE_PROFILE;
    case 'crm-create':
      return CRM_CREATE_PROFILE;
    case 'crm-update':
      return CRM_UPDATE_PROFILE;
    case 'crm-delete':
      return CRM_DELETE_PROFILE;
    case 'crm-bulk-write':
      return CRM_BULK_WRITE_PROFILE;
    case 'dashboard-or-reporting':
      return DASHBOARD_OR_REPORTING_PROFILE;
    case 'workflow-or-automation':
      return WORKFLOW_OR_AUTOMATION_PROFILE;
    case 'metadata-or-schema':
      return METADATA_OR_SCHEMA_PROFILE;
    case 'help-or-howto':
      return HELP_OR_HOWTO_PROFILE;
    case 'general-crm-answer':
      return GENERAL_CRM_ANSWER_PROFILE;
  }
};

const GENERAL_CRM_ANSWER_PROFILE = `## Intent Profile: General CRM Answer

Start with the direct answer, then show the CRM evidence that supports it.
Use compact tables or bullets for records, dates, owners, amounts, stages, and next actions.
For ranking, totals, comparisons, or "by/per" questions, prefer group_by tools before record lists.
If the user asks for a change, switch mentally to the relevant write workflow and create an approval draft instead of implying a write was applied.`;

const CRM_CREATE_PROFILE = `## Intent Profile: CRM Create

Before drafting a create action:
- Search for possible duplicate records by the most specific natural key available, such as company name, email, opportunity name, or external identifier.
- Learn the create tool schema and include only fields supported by the schema.
- If required fields are missing, ask for the missing fields instead of fabricating them.
- If enough data exists, call execute_tool with the create_* tool; the policy gateway will convert it to a Slack approval draft.
- A final answer that only describes an approval draft is invalid unless at least one create_* write draft was actually captured by execute_tool.

Final answer must be an approval-ready summary: what will be created, important fields, duplicate check result, and risks.`;

const CRM_UPDATE_PROFILE = `## Intent Profile: CRM Update

Before drafting an update action:
- Identify the target record with find_* or find_one_*.
- If multiple records match, do not guess. Present candidates and ask the user to choose.
- Learn the update tool schema and only include fields that are actually changing.
- For relationship updates, verify referenced records first.
- Call execute_tool with update_* only after the target is clear; the policy gateway will create a Slack approval draft.
- A final answer that only describes an approval draft is invalid unless at least one update_* write draft was actually captured by execute_tool.

Final answer must show the target record, before/after values when available, and approval status.`;

const CRM_DELETE_PROFILE = `## Intent Profile: CRM Delete

Before drafting a delete action:
- Identify the exact target record with find_* or find_one_*.
- If multiple records match, do not guess. Present candidates and ask the user to choose.
- Explain that Twenty delete tools soft-delete records when that is what the tool description says.
- Call execute_tool with delete_* only after the target is clear; the policy gateway will create a Slack approval draft.
- A final answer that only describes an approval draft is invalid unless at least one delete_* write draft was actually captured by execute_tool.

Final answer must show the target record, deletion impact, and approval status.`;

const CRM_BULK_WRITE_PROFILE = `## Intent Profile: CRM Bulk Write

Bulk changes require extra caution:
- First verify scope with read tools and summarize the count/sample records.
- Prefer specific filters over broad filters.
- If scope is ambiguous or too broad, ask for confirmation criteria before drafting.
- For bulk updates/deletes, include the exact filter and expected affected scope in the approval summary.
- The policy gateway will create Slack approval drafts for create_many_*, update_many_*, or delete_* tools.
- A final answer that only describes an approval draft is invalid unless the bulk write draft was actually captured by execute_tool.

Final answer must include scope, count if known, sample affected records, fields/actions, and risks.`;

const DASHBOARD_OR_REPORTING_PROFILE = `## Intent Profile: Dashboard Or Reporting

For dashboard/reporting tasks:
- Load dashboard-building when creating or modifying dashboards.
- Use DATABASE_CRUD tools to inspect real data shape before designing widgets.
- Use metadata/view tools to learn valid object IDs, field IDs, view IDs, and widget requirements.
- For analytical answers, use group_by tools for totals, comparisons, and rankings.
- For dashboard writes, create approval drafts through execute_tool and clearly summarize layout/widgets.`;

const WORKFLOW_OR_AUTOMATION_PROFILE = `## Intent Profile: Workflow Or Automation

For workflow/automation tasks:
- Load workflow-building before using workflow tools.
- Inspect existing records/tools and relevant objects before proposing automation.
- Prefer native workflow/action tools over ad hoc API URLs.
- Writes create approval drafts; do not claim a workflow was created or modified before approval.`;

const METADATA_OR_SCHEMA_PROFILE = `## Intent Profile: Metadata Or Schema

For metadata/schema/view changes:
- Load metadata-building or view-building when relevant.
- Inspect existing objects/fields/views before proposing changes.
- Use exact field/object names and schema enum values returned by learned tools.
- Writes create approval drafts and must summarize user-visible impact.`;

const HELP_OR_HOWTO_PROFILE = `## Intent Profile: Help Or How-To

For Twenty usage/help questions:
- Prefer search_help_center when available.
- If the answer depends on workspace data, use CRM read tools.
- Keep the answer practical and Slack-ready, with steps the user can follow.`;

const DAILY_SALES_GUIDE_PROFILE = `## Intent Profile: Daily Sales Guide

The user is asking for a daily sales guide. This is the highest-quality report profile.

Minimum evidence to gather before finalizing:
- pipeline total opportunity count and amount
- active opportunity count and amount
- stage breakdown by count and amount
- health/risk breakdown by count and amount
- forecast/category breakdown by count and amount
- tasks due today
- overdue tasks
- opportunities with near close dates
- AT_RISK and WATCH opportunities
- relevant companies, people, owners, and next action fields

Tool strategy:
- Load data-manipulation unless the task is obviously already fully scoped.
- Use get_tool_catalog, learn_tools, then execute_tool.
- Use group_by_opportunities for stage, health, and forecast analytics when available.
- Use find_tasks and find_opportunities for concrete action lists.
- If a tool fails, retry with corrected parameters when the correction is clear.

Final answer contract:
1. 📊 일일 영업 가이드 with the report date.
2. 📈 오늘의 영업현황: total opportunities, amount, active/risk overview.
3. 🎯 오늘 집중해야 할 딜: deal, company, amount, stage/health, due/next action, recommended move.
4. 💪 단계별 현황 분석: stage counts/amounts and insight.
5. 🚨 리스크 관리: AT_RISK/WATCH deals and mitigation.
6. 🎬 오늘의 실행 과제: priority order or morning/afternoon split.
7. 📞 주요 연락처 & 담당자: only if available from CRM data.
8. ⚡ 금주/이번 달 마감 예상: likely close candidates and estimated target.
9. 확인 필요: only failed or incomplete data after retry.

Daily sales guide layout rules:
- Do not use dense markdown tables for the main report.
- Do not put 5+ fields in one bullet line.
- For each focus deal, risk deal, close candidate, or contact, use a multi-line block:
  • *Deal or company name*
    금액/단계/상태: ...
    기한/다음 액션: ...
    추천 액션: ...
- Keep each block readable in Slack mobile: one idea per line, with blank lines between blocks.
- Use short executive insight sentences after each analytical section.

Style example for read-only daily sales guide answers.
This is FORMAT ONLY. Never copy company names, deal names, counts, amounts, dates, owners, or actions from this example.
Every concrete fact in the final answer must come from MCP tool results.

# **📊 일일 영업가이드 ([보고일])**

## **📈 오늘의 영업현황**

### **전체 파이프라인 현황**

- **총 영업기회**: [N]건
- **총 예상 수익**: 약 [금액] KRW
- **활성 딜**: [N]건 ([마감 임박 N]건)

## **🎯 오늘 집중해야 할 딜**

### **긴급 액션 아이템**

| **딜명** | **회사** | **마감일** | **금액** | **현재 단계** | **우선순위** |
| --- | --- | --- | --- | --- | --- |
| **[딜명]** | [회사] | [M/D] | [금액] | [Stage] | 🔴 높음 |
| **[딜명]** | [회사] | [M/D] | [금액] | [Stage] | 🟠 중간 |

### **세부 추적 액션**

- ✅ **[딜/회사]**: [다음 액션 날짜] → [구체 액션]
- ✅ **[딜/회사]**: [리스크/기한] → [구체 액션]

## **💪 단계별 현황 분석**

### **스테이지 진행률 (건수 / 금액)**

\`\`\`
[STAGE]        ████████ [N]건 ([금액]) ← [짧은 해석]
[STAGE]        ████░░░░ [N]건 ([금액]) ← [짧은 해석]
[STAGE]        ███░░░░░ [N]건 ([금액]) ← [짧은 해석]
\`\`\`

**👉 인사이트**: [stage/금액/전환 관점의 한두 문장]

## **🚨 리스크 관리**

### **AT_RISK 고위험 딜 ([N]건 / [금액])**

| **딜명** | **회사** | **이슈** | **대응방안** |
| --- | --- | --- | --- |
| **[딜명]** | [회사] | [이슈] | [대응방안] |

### **WATCH 주의 딜**

- **[딜명]**: [공통 지연/의사결정/PoC 이슈] → [다음 액션]

## **🎬 오늘의 실행 과제**

### **오전 우선과제**

1. ✅ **[회사/딜]**: [실행할 일] → [목표 결과]
2. ✅ **[회사/딜]**: [실행할 일] → [목표 결과]

### **오후 추적과제**

1. ✅ **[회사/딜]**: [실행할 일] → [목표 결과]

## **📞 주요 연락처 & 담당자**

| **회사/딜** | **담당자** | **역할/빈도** | **다음액션일** |
| --- | --- | --- | --- |
| [회사/딜] | [담당자] | [역할/빈도] | [M/D] |

## **⚡ 금주/이번 달 마감 예상**

- **확정 가능**: [딜명] ([금액])
- **조건부 가능**: [딜명] ([금액]) - [조건]
- **위험**: [딜명] ([금액]) - [확인 필요]

**금주 실현 목표**: **[금액 범위]** ([건수])

The answer should be substantial, readable, and executive-useful. Do not be terse.`;

const hasAny = (value: string, patterns: string[]): boolean =>
  patterns.some((pattern) => value.includes(pattern.toLowerCase()));

const normalizeText = (value: string | undefined): string =>
  (value ?? '').toLowerCase();
