import {
  defineView,
  ViewKey,
  ViewOpenRecordIn,
  ViewType,
  ViewVisibility,
} from 'twenty-sdk/define';

import {
  SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_REQUEST_OBJECT_UNIVERSAL_IDENTIFIER,
  SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';
import { createViewFields } from 'src/views/view-field';

export default defineView({
  universalIdentifier: SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS.requests,
  name: 'Slack Agent Requests',
  objectUniversalIdentifier: SLACK_AGENT_REQUEST_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconBrandSlack',
  position: 0,
  type: ViewType.TABLE,
  key: ViewKey.INDEX,
  visibility: ViewVisibility.WORKSPACE,
  openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
  fields: createViewFields([
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestTitle,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.title,
      position: 0,
      size: 220,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestStatus,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.status,
      position: 1,
      size: 140,
    },
    {
      universalIdentifier: SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestMode,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.mode,
      position: 2,
      size: 140,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestSource,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.source,
      position: 3,
      size: 130,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestSlackChannelId,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackChannelId,
      position: 4,
      size: 150,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestSlackUserId,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.slackUserId,
      position: 5,
      size: 150,
    },
    {
      universalIdentifier: SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestText,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.text,
      position: 6,
      size: 360,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestAnswerText,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.answerText,
      position: 7,
      size: 360,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestErrorMessage,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.errorMessage,
      position: 8,
      size: 260,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestReceivedAt,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.receivedAt,
      position: 9,
      size: 190,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestLastProcessedAt,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.lastProcessedAt,
      position: 10,
      size: 190,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.requestRawPayload,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS.rawPayload,
      position: 11,
      isVisible: false,
    },
  ]),
});
