import type {
  JsonRecord,
  SlackAgentApplyRequest,
  SlackAgentApplyResponse,
  SlackAgentProcessRequest,
  SlackAgentProcessResponse,
  WriteDraft,
} from '../types';

type SlackBlock = JsonRecord;

type PostProcessResponseInput =
  | {
      request: SlackAgentProcessRequest;
      result: SlackAgentProcessResponse;
      errorMessage?: never;
    }
  | {
      request: SlackAgentProcessRequest;
      result?: never;
      errorMessage: string;
    };

type PostApplyResponseInput =
  | {
      request: SlackAgentApplyRequest;
      result: SlackAgentApplyResponse;
      errorMessage?: never;
    }
  | {
      request: SlackAgentApplyRequest;
      result?: never;
      errorMessage: string;
    };

export const postSlackProcessResponse = async (
  input: PostProcessResponseInput,
): Promise<void> => {
  if (!input.request.responseUrl) {
    return;
  }

  if ('errorMessage' in input) {
    await postResponseUrl(input.request.responseUrl, {
      response_type: 'ephemeral',
      text: `CRM agent 처리에 실패했습니다: ${input.errorMessage}`,
    });
    return;
  }

  const { result } = input;

  if (result.status === 'needs_approval') {
    await postResponseUrl(input.request.responseUrl, {
      response_type: 'ephemeral',
      text: buildApprovalText(result),
      blocks: buildApprovalBlocks(input.request, result),
    });
    return;
  }

  await postResponseUrl(input.request.responseUrl, {
    response_type: 'ephemeral',
    text: result.assistantMessage,
  });
};

export const postSlackApplyResponse = async (
  input: PostApplyResponseInput,
): Promise<void> => {
  if (!input.request.responseUrl) {
    return;
  }

  if ('errorMessage' in input) {
    await postResponseUrl(input.request.responseUrl, {
      response_type: 'ephemeral',
      text: `CRM 변경 적용에 실패했습니다: ${input.errorMessage}`,
    });
    return;
  }

  await postResponseUrl(input.request.responseUrl, {
    response_type: 'ephemeral',
    text: 'CRM 변경을 적용했습니다.',
  });
};

const postResponseUrl = async (
  responseUrl: string,
  payload: JsonRecord,
): Promise<void> => {
  const response = await fetch(responseUrl, {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Slack response_url returned HTTP ${response.status}`);
  }
};

const buildApprovalText = (result: SlackAgentProcessResponse): string =>
  [
    '*CRM 변경 승인 필요*',
    result.assistantMessage,
    ...result.writeDrafts.map(formatWriteDraft),
  ].join('\n');

const buildApprovalBlocks = (
  request: SlackAgentProcessRequest,
  result: SlackAgentProcessResponse,
): SlackBlock[] => {
  const approvalIds = readStringArray(result.metadata, 'approvalIds');
  const approvalId = approvalIds[0];
  const draft = result.writeDrafts[0];

  if (!approvalId || !draft) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: buildApprovalText(result),
        },
      },
    ];
  }

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: buildApprovalText(result),
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '승인' },
          style: 'primary',
          action_id: 'slack_agent_approve',
          value: JSON.stringify({
            slackAgentApprovalId: approvalId,
            slackAgentRequestId: request.slackAgentRequestId,
          }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '취소' },
          style: 'danger',
          action_id: 'slack_agent_reject',
          value: JSON.stringify({
            slackAgentApprovalId: approvalId,
            slackAgentRequestId: request.slackAgentRequestId,
          }),
        },
      ],
    },
  ];
};

const formatWriteDraft = (draft: WriteDraft): string =>
  [
    `도구: \`${draft.toolName}\``,
    draft.reason ? `사유: ${draft.reason}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

const readStringArray = (
  value: JsonRecord | undefined,
  key: string,
): string[] => {
  const candidate = value?.[key];

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item): item is string => typeof item === 'string');
};
