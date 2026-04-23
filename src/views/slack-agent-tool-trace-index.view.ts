import {
  defineView,
  ViewKey,
  ViewOpenRecordIn,
  ViewType,
  ViewVisibility,
} from 'twenty-sdk/define';

import {
  SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_TOOL_TRACE_OBJECT_UNIVERSAL_IDENTIFIER,
  SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';
import { createViewFields } from 'src/views/view-field';

export default defineView({
  universalIdentifier: SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS.toolTraces,
  name: 'Slack Agent Tool Traces',
  objectUniversalIdentifier: SLACK_AGENT_TOOL_TRACE_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconTool',
  position: 0,
  type: ViewType.TABLE,
  key: ViewKey.INDEX,
  visibility: ViewVisibility.WORKSPACE,
  openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
  fields: createViewFields([
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceTitle,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.title,
      position: 0,
      size: 240,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceStatus,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.status,
      position: 1,
      size: 140,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceToolName,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.toolName,
      position: 2,
      size: 260,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceSlackAgentRequestId,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.slackAgentRequestId,
      position: 3,
      size: 260,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceDurationMs,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.durationMs,
      position: 4,
      size: 130,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceErrorMessage,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.errorMessage,
      position: 5,
      size: 300,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceStartedAt,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.startedAt,
      position: 6,
      size: 190,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceFinishedAt,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.finishedAt,
      position: 7,
      size: 190,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceInput,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.input,
      position: 8,
      isVisible: false,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTracePolicySessionId,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.policySessionId,
      position: 9,
      size: 260,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTracePromptProfile,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.promptProfile,
      position: 10,
      size: 220,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceRetryCount,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.retryCount,
      position: 11,
      size: 130,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.toolTraceErrorHint,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS.errorHint,
      position: 12,
      size: 280,
    },
  ]),
});
