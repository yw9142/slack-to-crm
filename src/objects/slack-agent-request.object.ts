import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_REQUEST_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import type { SelectOption } from 'src/objects/select-option';

export const SLACK_AGENT_REQUEST_SOURCE_OPTIONS = [
  { value: 'EVENT', label: 'Event', position: 0, color: 'blue' },
  { value: 'COMMAND', label: 'Command', position: 1, color: 'purple' },
  { value: 'INTERACTIVITY', label: 'Interactivity', position: 2, color: 'sky' },
] satisfies SelectOption[];

export const SLACK_AGENT_REQUEST_STATUS_OPTIONS = [
  { value: 'QUEUED', label: 'Queued', position: 0, color: 'gray' },
  { value: 'PROCESSING', label: 'Processing', position: 1, color: 'blue' },
  {
    value: 'AWAITING_APPROVAL',
    label: 'Awaiting approval',
    position: 2,
    color: 'orange',
  },
  { value: 'APPROVED', label: 'Approved', position: 3, color: 'green' },
  { value: 'REJECTED', label: 'Rejected', position: 4, color: 'red' },
  { value: 'COMPLETED', label: 'Completed', position: 5, color: 'green' },
  { value: 'FAILED', label: 'Failed', position: 6, color: 'red' },
  {
    value: 'HANDOFF_FAILED',
    label: 'Handoff failed',
    position: 7,
    color: 'red',
  },
] satisfies SelectOption[];

export const SLACK_AGENT_REQUEST_MODE_OPTIONS = [
  { value: 'ANSWER', label: 'Answer', position: 0, color: 'blue' },
  { value: 'WRITE_DRAFT', label: 'Write draft', position: 1, color: 'orange' },
  { value: 'APPLIED', label: 'Applied', position: 2, color: 'green' },
  { value: 'ERROR', label: 'Error', position: 3, color: 'red' },
] satisfies SelectOption[];

export default defineObject({
  universalIdentifier: SLACK_AGENT_REQUEST_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'slackAgentRequest',
  namePlural: 'slackAgentRequests',
  labelSingular: 'Slack Agent Request',
  labelPlural: 'Slack Agent Requests',
  description: 'Slack ingress requests handed off to the CRM agent worker.',
  icon: 'IconBrandSlack',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.title,
  fields: [
    {
      universalIdentifier: SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.title,
      name: 'title',
      type: FieldType.TEXT,
      label: 'Title',
      icon: 'IconTextCaption',
    },
    {
      universalIdentifier: SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.source,
      name: 'source',
      type: FieldType.SELECT,
      label: 'Source',
      icon: 'IconPlug',
      defaultValue: "'EVENT'",
      options: SLACK_AGENT_REQUEST_SOURCE_OPTIONS,
    },
    {
      universalIdentifier: SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.status,
      name: 'status',
      type: FieldType.SELECT,
      label: 'Status',
      icon: 'IconStatusChange',
      defaultValue: "'QUEUED'",
      options: SLACK_AGENT_REQUEST_STATUS_OPTIONS,
    },
    {
      universalIdentifier: SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.mode,
      name: 'mode',
      type: FieldType.SELECT,
      label: 'Mode',
      icon: 'IconRouteAltLeft',
      isNullable: true,
      defaultValue: null,
      options: SLACK_AGENT_REQUEST_MODE_OPTIONS,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackTeamId,
      name: 'slackTeamId',
      type: FieldType.TEXT,
      label: 'Slack team ID',
      icon: 'IconUsersGroup',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackChannelId,
      name: 'slackChannelId',
      type: FieldType.TEXT,
      label: 'Slack channel ID',
      icon: 'IconMessageCircle',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackChannelName,
      name: 'slackChannelName',
      type: FieldType.TEXT,
      label: 'Slack channel name',
      icon: 'IconHash',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackThreadTs,
      name: 'slackThreadTs',
      type: FieldType.TEXT,
      label: 'Slack thread timestamp',
      icon: 'IconMessages',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackMessageTs,
      name: 'slackMessageTs',
      type: FieldType.TEXT,
      label: 'Slack message timestamp',
      icon: 'IconMessage',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackUserId,
      name: 'slackUserId',
      type: FieldType.TEXT,
      label: 'Slack user ID',
      icon: 'IconUser',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackUserName,
      name: 'slackUserName',
      type: FieldType.TEXT,
      label: 'Slack user name',
      icon: 'IconUserCircle',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.command,
      name: 'command',
      type: FieldType.TEXT,
      label: 'Command',
      icon: 'IconTerminal',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.text,
      name: 'text',
      type: FieldType.TEXT,
      label: 'Text',
      icon: 'IconAlignLeft',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.responseUrl,
      name: 'responseUrl',
      type: FieldType.TEXT,
      label: 'Response URL',
      icon: 'IconLink',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.rawPayload,
      name: 'rawPayload',
      type: FieldType.RAW_JSON,
      label: 'Raw payload',
      icon: 'IconJson',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.normalizedText,
      name: 'normalizedText',
      type: FieldType.TEXT,
      label: 'Normalized text',
      icon: 'IconAlignLeft',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.answerText,
      name: 'answerText',
      type: FieldType.TEXT,
      label: 'Answer text',
      icon: 'IconMessageReply',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.resultPayload,
      name: 'resultPayload',
      type: FieldType.RAW_JSON,
      label: 'Result payload',
      icon: 'IconJson',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.draftPayload,
      name: 'draftPayload',
      type: FieldType.RAW_JSON,
      label: 'Draft payload',
      icon: 'IconJson',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.recordReferences,
      name: 'recordReferences',
      type: FieldType.RAW_JSON,
      label: 'Record references',
      icon: 'IconListSearch',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.dedupeKey,
      name: 'dedupeKey',
      type: FieldType.TEXT,
      label: 'Dedupe key',
      icon: 'IconFingerprint',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.errorMessage,
      name: 'errorMessage',
      type: FieldType.TEXT,
      label: 'Error message',
      icon: 'IconAlertTriangle',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackAgentThreadId,
      name: 'slackAgentThreadId',
      type: FieldType.TEXT,
      label: 'Slack agent thread ID',
      icon: 'IconMessages',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.pendingApprovalId,
      name: 'pendingApprovalId',
      type: FieldType.TEXT,
      label: 'Pending approval ID',
      icon: 'IconCircleCheck',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.receivedAt,
      name: 'receivedAt',
      type: FieldType.DATE_TIME,
      label: 'Received at',
      icon: 'IconClock',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.lastProcessedAt,
      name: 'lastProcessedAt',
      type: FieldType.DATE_TIME,
      label: 'Last processed at',
      icon: 'IconClockCheck',
      isNullable: true,
      defaultValue: null,
    },
  ],
});
