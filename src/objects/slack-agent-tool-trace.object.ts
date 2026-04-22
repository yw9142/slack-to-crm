import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_TOOL_TRACE_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import type { SelectOption } from 'src/objects/select-option';

export const SLACK_AGENT_TOOL_TRACE_STATUS_OPTIONS = [
  { value: 'STARTED', label: 'Started', position: 0, color: 'gray' },
  { value: 'SUCCEEDED', label: 'Succeeded', position: 1, color: 'green' },
  { value: 'DRAFTED', label: 'Drafted', position: 2, color: 'orange' },
  { value: 'FAILED', label: 'Failed', position: 3, color: 'red' },
  { value: 'BLOCKED', label: 'Blocked', position: 4, color: 'red' },
] satisfies SelectOption[];

export default defineObject({
  universalIdentifier: SLACK_AGENT_TOOL_TRACE_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'slackAgentToolTrace',
  namePlural: 'slackAgentToolTraces',
  labelSingular: 'Slack Agent Tool Trace',
  labelPlural: 'Slack Agent Tool Traces',
  description: 'MCP tool calls made by the Slack CRM worker.',
  icon: 'IconTool',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.title,
  fields: [
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.title,
      name: 'title',
      type: FieldType.TEXT,
      label: 'Title',
      icon: 'IconTextCaption',
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.status,
      name: 'status',
      type: FieldType.SELECT,
      label: 'Status',
      icon: 'IconStatusChange',
      defaultValue: "'STARTED'",
      options: SLACK_AGENT_TOOL_TRACE_STATUS_OPTIONS,
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.slackAgentRequestId,
      name: 'slackAgentRequestId',
      type: FieldType.TEXT,
      label: 'Slack agent request ID',
      icon: 'IconInbox',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.slackAgentThreadId,
      name: 'slackAgentThreadId',
      type: FieldType.TEXT,
      label: 'Slack agent thread ID',
      icon: 'IconMessages',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.toolName,
      name: 'toolName',
      type: FieldType.TEXT,
      label: 'Tool name',
      icon: 'IconTool',
    },
    {
      universalIdentifier: SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.input,
      name: 'input',
      type: FieldType.RAW_JSON,
      label: 'Input',
      icon: 'IconJson',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.output,
      name: 'output',
      type: FieldType.RAW_JSON,
      label: 'Output',
      icon: 'IconJson',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.errorMessage,
      name: 'errorMessage',
      type: FieldType.TEXT,
      label: 'Error message',
      icon: 'IconAlertTriangle',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.durationMs,
      name: 'durationMs',
      type: FieldType.NUMBER,
      label: 'Duration ms',
      icon: 'IconClockBolt',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.startedAt,
      name: 'startedAt',
      type: FieldType.DATE_TIME,
      label: 'Started at',
      icon: 'IconClock',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.finishedAt,
      name: 'finishedAt',
      type: FieldType.DATE_TIME,
      label: 'Finished at',
      icon: 'IconClockCheck',
      isNullable: true,
      defaultValue: null,
    },
  ],
});
