import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_APPROVAL_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import type { SelectOption } from 'src/objects/select-option';

export const SLACK_AGENT_APPROVAL_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending', position: 0, color: 'orange' },
  { value: 'APPROVED', label: 'Approved', position: 1, color: 'green' },
  { value: 'REJECTED', label: 'Rejected', position: 2, color: 'red' },
  { value: 'APPLY_FAILED', label: 'Apply failed', position: 3, color: 'red' },
] satisfies SelectOption[];

export default defineObject({
  universalIdentifier: SLACK_AGENT_APPROVAL_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'slackAgentApproval',
  namePlural: 'slackAgentApprovals',
  labelSingular: 'Slack Agent Approval',
  labelPlural: 'Slack Agent Approvals',
  description: 'Approval decisions received from Slack interactivity payloads.',
  icon: 'IconCircleCheck',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.title,
  fields: [
    {
      universalIdentifier: SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.title,
      name: 'title',
      type: FieldType.TEXT,
      label: 'Title',
      icon: 'IconTextCaption',
    },
    {
      universalIdentifier: SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.status,
      name: 'status',
      type: FieldType.SELECT,
      label: 'Status',
      icon: 'IconStatusChange',
      defaultValue: "'PENDING'",
      options: SLACK_AGENT_APPROVAL_STATUS_OPTIONS,
    },
    {
      universalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.slackAgentRequestId,
      name: 'slackAgentRequestId',
      type: FieldType.TEXT,
      label: 'Slack agent request ID',
      icon: 'IconInbox',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.slackAgentThreadId,
      name: 'slackAgentThreadId',
      type: FieldType.TEXT,
      label: 'Slack agent thread ID',
      icon: 'IconMessages',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.slackApproverUserId,
      name: 'slackApproverUserId',
      type: FieldType.TEXT,
      label: 'Slack approver user ID',
      icon: 'IconUserCheck',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.slackActionId,
      name: 'slackActionId',
      type: FieldType.TEXT,
      label: 'Slack action ID',
      icon: 'IconClick',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.decidedAt,
      name: 'decidedAt',
      type: FieldType.DATE_TIME,
      label: 'Decided at',
      icon: 'IconClockCheck',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.summary,
      name: 'summary',
      type: FieldType.TEXT,
      label: 'Summary',
      icon: 'IconTextCaption',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.actions,
      name: 'actions',
      type: FieldType.RAW_JSON,
      label: 'Actions',
      icon: 'IconListDetails',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.warnings,
      name: 'warnings',
      type: FieldType.RAW_JSON,
      label: 'Warnings',
      icon: 'IconAlertTriangle',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.appliedResult,
      name: 'appliedResult',
      type: FieldType.RAW_JSON,
      label: 'Applied result',
      icon: 'IconJson',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.workerPayload,
      name: 'workerPayload',
      type: FieldType.RAW_JSON,
      label: 'Worker payload',
      icon: 'IconJson',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.rawPayload,
      name: 'rawPayload',
      type: FieldType.RAW_JSON,
      label: 'Raw payload',
      icon: 'IconJson',
      isNullable: true,
      defaultValue: null,
    },
  ],
});
