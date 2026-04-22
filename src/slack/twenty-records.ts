import { CoreApiClient } from 'twenty-client-sdk/core';

import type {
  JsonObject,
  SlackAgentApprovalStatus,
  SlackAgentRequestStatus,
  SlackIngressSource,
} from 'src/slack/types';

type RecordIdMutationResult<TMutationName extends string> = Record<
  TMutationName,
  { id: string }
>;

type SlackAgentThreadInput = {
  slackTeamId?: string;
  slackChannelId?: string;
  slackChannelName?: string;
  slackThreadTs?: string;
  latestSlackMessageTs?: string;
};

type SlackAgentRequestInput = SlackAgentThreadInput & {
  source: SlackIngressSource;
  slackAgentThreadId?: string;
  slackMessageTs?: string;
  slackUserId?: string;
  slackUserName?: string;
  command?: string;
  text?: string;
  responseUrl?: string;
  rawPayload: JsonObject;
};

type SlackAgentApprovalDecisionInput = {
  slackAgentApprovalId: string;
  slackAgentRequestId: string;
  slackAgentThreadId?: string;
  slackApproverUserId?: string;
  slackActionId?: string;
  status: SlackAgentApprovalStatus;
  workerPayload?: JsonObject;
  rawPayload: JsonObject;
};

export async function createSlackAgentThreadRecord(
  input: SlackAgentThreadInput,
): Promise<string> {
  const client = new CoreApiClient();
  const result = (await client.mutation({
    createSlackAgentThread: {
      __args: {
        data: {
          title: buildSlackThreadTitle(input),
          status: 'OPEN',
          slackTeamId: input.slackTeamId ?? null,
          slackChannelId: input.slackChannelId ?? null,
          slackChannelName: input.slackChannelName ?? null,
          slackThreadTs: input.slackThreadTs ?? null,
          latestSlackMessageTs: input.latestSlackMessageTs ?? null,
        },
      },
      id: true,
    },
  })) as RecordIdMutationResult<'createSlackAgentThread'>;

  return result.createSlackAgentThread.id;
}

export async function updateSlackAgentThreadLatestRequest({
  slackAgentThreadId,
  slackAgentRequestId,
}: {
  slackAgentThreadId: string;
  slackAgentRequestId: string;
}): Promise<void> {
  const client = new CoreApiClient();

  await client.mutation({
    updateSlackAgentThread: {
      __args: {
        id: slackAgentThreadId,
        data: {
          latestSlackAgentRequestId: slackAgentRequestId,
        },
      },
      id: true,
    },
  });
}

export async function createSlackAgentRequestRecord(
  input: SlackAgentRequestInput,
): Promise<string> {
  const client = new CoreApiClient();
  const result = (await client.mutation({
    createSlackAgentRequest: {
      __args: {
        data: {
          title: buildSlackRequestTitle(input),
          source: input.source,
          status: 'QUEUED',
          slackTeamId: input.slackTeamId ?? null,
          slackChannelId: input.slackChannelId ?? null,
          slackChannelName: input.slackChannelName ?? null,
          slackThreadTs: input.slackThreadTs ?? null,
          slackMessageTs: input.slackMessageTs ?? null,
          slackUserId: input.slackUserId ?? null,
          slackUserName: input.slackUserName ?? null,
          command: input.command ?? null,
          text: input.text ?? null,
          responseUrl: input.responseUrl ?? null,
          rawPayload: input.rawPayload,
          slackAgentThreadId: input.slackAgentThreadId ?? null,
        },
      },
      id: true,
    },
  })) as RecordIdMutationResult<'createSlackAgentRequest'>;

  return result.createSlackAgentRequest.id;
}

export async function updateSlackAgentRequestStatus({
  slackAgentRequestId,
  status,
  errorMessage,
}: {
  slackAgentRequestId: string;
  status: SlackAgentRequestStatus;
  errorMessage?: string;
}): Promise<void> {
  const client = new CoreApiClient();

  await client.mutation({
    updateSlackAgentRequest: {
      __args: {
        id: slackAgentRequestId,
        data: {
          status,
          errorMessage: errorMessage ?? null,
        },
      },
      id: true,
    },
  });
}

export async function updateSlackAgentApprovalDecisionRecord({
  slackAgentApprovalId,
  slackAgentRequestId,
  slackAgentThreadId,
  slackApproverUserId,
  slackActionId,
  status,
  workerPayload,
  rawPayload,
}: SlackAgentApprovalDecisionInput): Promise<void> {
  const client = new CoreApiClient();

  await client.mutation({
    updateSlackAgentApproval: {
      __args: {
        id: slackAgentApprovalId,
        data: {
          title: `Slack approval ${status.toLowerCase()}`,
          status,
          slackAgentRequestId,
          slackAgentThreadId: slackAgentThreadId ?? null,
          slackApproverUserId: slackApproverUserId ?? null,
          slackActionId: slackActionId ?? null,
          decidedAt: new Date().toISOString(),
          workerPayload: workerPayload ?? null,
          rawPayload,
        },
      },
      id: true,
    },
  });
}

function buildSlackThreadTitle(input: SlackAgentThreadInput): string {
  return [
    input.slackChannelName ? `#${input.slackChannelName}` : input.slackChannelId,
    input.slackThreadTs,
  ]
    .filter(Boolean)
    .join(' / ');
}

function buildSlackRequestTitle(input: SlackAgentRequestInput): string {
  const source = input.command ?? input.source.toLowerCase();
  const channel = input.slackChannelName
    ? `#${input.slackChannelName}`
    : input.slackChannelId;

  return [source, channel, input.text?.slice(0, 80)].filter(Boolean).join(' / ');
}
