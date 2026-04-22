import {
  defineView,
  ViewKey,
  ViewOpenRecordIn,
  ViewType,
  ViewVisibility,
} from 'twenty-sdk/define';

import {
  SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_THREAD_OBJECT_UNIVERSAL_IDENTIFIER,
  SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';
import { createViewFields } from 'src/views/view-field';

export default defineView({
  universalIdentifier: SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS.threads,
  name: 'Slack Agent Threads',
  objectUniversalIdentifier: SLACK_AGENT_THREAD_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconMessages',
  position: 0,
  type: ViewType.TABLE,
  key: ViewKey.INDEX,
  visibility: ViewVisibility.WORKSPACE,
  openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
  fields: createViewFields([
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.threadTitle,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.title,
      position: 0,
      size: 220,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.threadStatus,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.status,
      position: 1,
      size: 130,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.threadSlackChannelId,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.slackChannelId,
      position: 2,
      size: 150,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.threadSlackThreadTs,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.slackThreadTs,
      position: 3,
      size: 180,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.threadLatestSlackMessageTs,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.latestSlackMessageTs,
      position: 4,
      size: 190,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.threadLatestSlackAgentRequestId,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.latestSlackAgentRequestId,
      position: 5,
      size: 260,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.threadSummary,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.summary,
      position: 6,
      size: 360,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.threadPendingApproval,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS.pendingApproval,
      position: 7,
      isVisible: false,
    },
  ]),
});
