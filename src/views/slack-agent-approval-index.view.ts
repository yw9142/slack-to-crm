import {
  defineView,
  ViewKey,
  ViewOpenRecordIn,
  ViewType,
  ViewVisibility,
} from 'twenty-sdk/define';

import {
  SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_APPROVAL_OBJECT_UNIVERSAL_IDENTIFIER,
  SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';
import { createViewFields } from 'src/views/view-field';

export default defineView({
  universalIdentifier: SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS.approvals,
  name: 'Slack Agent Approvals',
  objectUniversalIdentifier: SLACK_AGENT_APPROVAL_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconCircleCheck',
  position: 0,
  type: ViewType.TABLE,
  key: ViewKey.INDEX,
  visibility: ViewVisibility.WORKSPACE,
  openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
  fields: createViewFields([
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.approvalTitle,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.title,
      position: 0,
      size: 220,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.approvalStatus,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.status,
      position: 1,
      size: 140,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.approvalSlackAgentRequestId,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.slackAgentRequestId,
      position: 2,
      size: 260,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.approvalSlackApproverUserId,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.slackApproverUserId,
      position: 3,
      size: 180,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.approvalDecidedAt,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.decidedAt,
      position: 4,
      size: 190,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.approvalSummary,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.summary,
      position: 5,
      size: 360,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.approvalActions,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.actions,
      position: 6,
      isVisible: false,
    },
    {
      universalIdentifier:
        SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.approvalAppliedResult,
      fieldMetadataUniversalIdentifier:
        SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS.appliedResult,
      position: 7,
      isVisible: false,
    },
  ]),
});
