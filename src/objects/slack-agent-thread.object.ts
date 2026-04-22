import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_THREAD_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import type { SelectOption } from 'src/objects/select-option';

export const SLACK_AGENT_THREAD_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open', position: 0, color: 'green' },
  { value: 'WAITING', label: 'Waiting', position: 1, color: 'orange' },
  { value: 'CLOSED', label: 'Closed', position: 2, color: 'gray' },
  { value: 'FAILED', label: 'Failed', position: 3, color: 'red' },
] satisfies SelectOption[];

export default defineObject({
  universalIdentifier: SLACK_AGENT_THREAD_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'slackAgentThread',
  namePlural: 'slackAgentThreads',
  labelSingular: 'Slack Agent Thread',
  labelPlural: 'Slack Agent Threads',
  description: 'Slack thread context tracked for agent handoffs.',
  icon: 'IconMessages',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.title,
  fields: [
    {
      universalIdentifier: SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.title,
      name: 'title',
      type: FieldType.TEXT,
      label: 'Title',
      icon: 'IconTextCaption',
    },
    {
      universalIdentifier: SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.status,
      name: 'status',
      type: FieldType.SELECT,
      label: 'Status',
      icon: 'IconStatusChange',
      defaultValue: "'OPEN'",
      options: SLACK_AGENT_THREAD_STATUS_OPTIONS,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.slackTeamId,
      name: 'slackTeamId',
      type: FieldType.TEXT,
      label: 'Slack team ID',
      icon: 'IconUsersGroup',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.slackChannelId,
      name: 'slackChannelId',
      type: FieldType.TEXT,
      label: 'Slack channel ID',
      icon: 'IconMessageCircle',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.slackChannelName,
      name: 'slackChannelName',
      type: FieldType.TEXT,
      label: 'Slack channel name',
      icon: 'IconHash',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.slackThreadTs,
      name: 'slackThreadTs',
      type: FieldType.TEXT,
      label: 'Slack thread timestamp',
      icon: 'IconMessages',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.latestSlackMessageTs,
      name: 'latestSlackMessageTs',
      type: FieldType.TEXT,
      label: 'Latest Slack message timestamp',
      icon: 'IconMessage',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.latestSlackAgentRequestId,
      name: 'latestSlackAgentRequestId',
      type: FieldType.TEXT,
      label: 'Latest Slack agent request ID',
      icon: 'IconInbox',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.summary,
      name: 'summary',
      type: FieldType.TEXT,
      label: 'Summary',
      icon: 'IconTextCaption',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.recentTurns,
      name: 'recentTurns',
      type: FieldType.RAW_JSON,
      label: 'Recent turns',
      icon: 'IconMessages',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.selectedRecords,
      name: 'selectedRecords',
      type: FieldType.RAW_JSON,
      label: 'Selected records',
      icon: 'IconListSearch',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.pendingApproval,
      name: 'pendingApproval',
      type: FieldType.RAW_JSON,
      label: 'Pending approval',
      icon: 'IconCircleCheck',
      isNullable: true,
      defaultValue: null,
    },
  ],
});
