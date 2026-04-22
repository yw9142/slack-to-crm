export const APP_DISPLAY_NAME = 'Slack to CRM';
export const APP_DESCRIPTION = 'Slack CRM agent powered by Twenty MCP';
export const APPLICATION_UNIVERSAL_IDENTIFIER = '901a7549-e439-43c2-b9b4-772cc04306d9';
export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER = '78d60d64-b81e-4aa1-9258-e3fc7d962c7a';

export const SLACK_AGENT_REQUEST_OBJECT_UNIVERSAL_IDENTIFIER =
  '53a5bc8b-0fd2-459b-8e7d-49e588c14252';
export const SLACK_AGENT_THREAD_OBJECT_UNIVERSAL_IDENTIFIER =
  '56070af2-92b1-4f91-ad0e-5905a1141961';
export const SLACK_AGENT_APPROVAL_OBJECT_UNIVERSAL_IDENTIFIER =
  'e974dcdb-6707-4cfd-aebe-88832f957faf';
export const SLACK_AGENT_TOOL_TRACE_OBJECT_UNIVERSAL_IDENTIFIER =
  '356bb2e5-f377-4535-8326-2877f393a225';

export const SLACK_AGENT_REQUEST_FIELD_UNIVERSAL_IDENTIFIERS = {
  title: '2f147462-b1de-4dfb-bfa5-c997d6c5fa08',
  source: '0af3a837-9e56-4b2f-b4de-939b136c516c',
  status: '6fe74644-fb0a-4be1-b42e-674f8323e6e2',
  mode: 'a82f06b6-54fc-4fa0-821f-0ab4687fb633',
  slackTeamId: '0a3fa3e4-012f-439d-9053-4400b587742e',
  slackChannelId: 'bd6e0f78-0940-46ee-8eb3-a4c6c3dff6f2',
  slackChannelName: '49f5042d-0ce3-4e2f-ae2d-0b66bf32385d',
  slackThreadTs: '8d69bb7c-4611-490e-bbcc-284bc78a5883',
  slackMessageTs: '55e9b25e-2415-4f12-aef2-4ba31a473736',
  slackUserId: '2fd4d0f7-7a08-4840-bc88-0063c224e36c',
  slackUserName: '6b87b3d6-c8bf-47f3-8299-d7901fd9867b',
  command: '0aa864eb-fd19-43c2-8f47-b3cdac8027de',
  text: '549ea33f-7610-4f4b-a0a2-76819a1c1949',
  responseUrl: 'aa269b85-74f1-4909-a6f1-d1ccc8f85d5f',
  rawPayload: 'a26f4c19-3086-4b10-8d69-388822f0ccec',
  normalizedText: 'b25e6903-1f8a-47cb-a9f5-47c83e921d96',
  answerText: 'a862306a-0ad3-4cea-b5db-8f9fbe456a51',
  resultPayload: 'bce44afa-cd52-4caa-a9d5-f32433af5620',
  draftPayload: 'd5155a77-af8d-4656-97e5-0943f443fb13',
  recordReferences: 'f145b67b-03e6-4509-a3d8-7e8829e78a62',
  dedupeKey: 'b3983fea-98b9-4214-9dad-e388fd8b1915',
  errorMessage: 'd760bb9d-20db-4848-8b7d-ac3c8e9ec134',
  slackAgentThreadId: 'b82561b3-71e8-4b91-aa77-b8d65f07f70a',
  pendingApprovalId: 'ada6328a-8dc3-4cd3-b0dd-2669c48ed458',
  receivedAt: '9d5fe63b-ead6-4558-98c2-b91f990cb4e0',
  lastProcessedAt: 'a2645cd6-1580-4d48-b5a4-c460cc4aee4b',
} as const;

export const SLACK_AGENT_THREAD_FIELD_UNIVERSAL_IDENTIFIERS = {
  title: '23dea717-a023-4ab2-a729-1aee6c12efc5',
  status: '4aa8da54-0428-4223-a018-631127240036',
  slackTeamId: 'c7d597f7-cd4b-4ec6-a5cd-3b436faaa07f',
  slackChannelId: '9c8a8d7a-7656-4486-b5d0-00969b8eaf6c',
  slackChannelName: '6fed4f0b-e532-4eca-b1e9-6ae8e2cd1445',
  slackThreadTs: '34513d7e-1623-4e13-ad78-1a0b58140baa',
  latestSlackMessageTs: 'd458a584-eb57-4d9b-962c-154508fb5f42',
  latestSlackAgentRequestId: 'f48d977c-a717-4573-a5d6-9cebb2f02954',
  summary: '0a02c410-20cc-41d5-92a2-465a403ce94a',
  recentTurns: '18353f52-71ef-4951-a5c0-20326b2ebe74',
  selectedRecords: 'dc85ced3-4757-4719-a337-1bbbdc9e1b67',
  pendingApproval: 'c0a9ea3c-f9b3-49ee-89ed-11c3e6faa380',
} as const;

export const SLACK_AGENT_APPROVAL_FIELD_UNIVERSAL_IDENTIFIERS = {
  title: 'f8badb29-db1a-4638-a2c6-fc2cdc6a29ed',
  status: '41f9948c-b7f5-46bd-b1b3-e7b3c04382e7',
  slackAgentRequestId: '2b58e18b-dd2a-48db-8274-2c61c8931406',
  slackAgentThreadId: '0d91f24b-9524-48ea-bf8f-41cae03e2f53',
  slackApproverUserId: '797ffcd9-7e78-4852-a05a-53bcf394c1fe',
  slackActionId: 'ffb509cc-7b1f-4201-99c1-d5c45d8001f9',
  decidedAt: 'aaed6af2-c9f4-43b7-8174-cd43a746df56',
  summary: 'd8483b73-9667-446a-9a0d-1e00c4930f20',
  actions: 'f43ba300-4c7f-47dc-a2f8-347096dda014',
  warnings: '633a8f16-3c62-4c83-9671-0e32bf05c808',
  appliedResult: 'bdceb973-6039-4d5f-bc93-c1b303b2fbe9',
  workerPayload: '1a0e5318-a264-4ade-9241-55ac8a24681a',
  rawPayload: 'fdfa1adc-5563-4c1b-b75c-3d3175416cf1',
} as const;

export const SLACK_AGENT_TOOL_TRACE_FIELD_UNIVERSAL_IDENTIFIERS = {
  title: '47a957e7-5c6a-44f1-9f9e-99d56e6fdf6c',
  status: '9caa4da3-0797-435c-b6e3-17ea9d8b62bc',
  slackAgentRequestId: 'eac768f4-ecfa-46c0-9b1b-c567a2ce63ad',
  slackAgentThreadId: 'ce3b6e4d-719c-43a1-ad7a-8914ec2f342d',
  toolName: 'd91ef53c-5673-468e-9694-0e35d2de87b3',
  input: '19358f54-3aa5-4ada-887a-084f9ef3ea82',
  output: 'b3db835c-443d-45de-ae81-33f2afd0c5c8',
  errorMessage: '13c59737-9db2-4c2b-b0b5-e52ccde736ab',
  durationMs: 'b54443e1-317f-4b76-9725-c16ec290e24b',
  startedAt: '2ef33c9c-2373-4ca5-98e0-0bf309803b93',
  finishedAt: '4767e72e-2f05-481d-9013-6dc69c0e1f5d',
} as const;

export const APPLICATION_VARIABLE_UNIVERSAL_IDENTIFIERS = {
  slackSigningSecret: 'b481f99e-93b9-4ad5-bab7-0ba909e2a589',
  slackBotToken: 'a6b0ee2a-3a24-4ecf-9718-bd4d98e1c627',
  slackAllowedChannelIds: 'f9c01faa-4a56-46ea-91e5-7553f1a969a4',
  workerBaseUrl: '2e3b8092-cbe7-48b1-81f4-429960b82532',
  workerSharedSecret: '461f2bf1-d882-4a5f-a9a8-5772710b5250',
  twentyPublicUrl: '4971183b-75f8-4d2e-84f6-aae7471ea335',
} as const;

export const LOGIC_FUNCTION_UNIVERSAL_IDENTIFIERS = {
  slackEvents: '15822222-b9c7-4662-aa72-b6bbf40c86e4',
  slackCommands: '50e22fde-a5b4-411c-b382-3eb5e0faeae1',
  slackInteractivity: 'f54c9cf0-3e75-4e96-8503-bedaa9e5efe3',
} as const;

export const SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS = {
  requests: '43f42b5f-5d5d-452f-9dc2-dbb79a1ee1ff',
  toolTraces: '32b042b2-5973-440b-8c8c-93936baa6eab',
  approvals: 'c162768a-9040-4b1b-9744-f1fffb7c6c6f',
  threads: 'adfd9a9d-24c6-4a95-b82f-6920d0631ded',
} as const;

export const SLACK_AGENT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIERS = {
  requests: '5fea8287-8bbd-4c87-9ba7-707305456b60',
  toolTraces: '97f521ad-bb49-429e-94ec-b11cd19ec60d',
  approvals: '0b72588a-b1e8-4d66-9369-5f23cab2a020',
  threads: '1a6db5f0-cc71-49ab-9105-214e9e0b5015',
} as const;

export const SLACK_AGENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS = {
  requestTitle: 'bb4716ff-8eff-4d85-bd67-abafe79c3471',
  requestStatus: '33c634e9-b30f-4e88-a06c-af60414f1b0c',
  requestMode: 'be0851c0-a87c-4ac1-9f59-b4ba979a3683',
  requestSource: '1b1df9cc-edf8-4f04-a718-ff5f326b7f6e',
  requestSlackChannelId: '1e2f4994-e64d-4059-96ef-e98dbf9503a7',
  requestSlackUserId: '7c77791a-e0b1-42b2-9966-99dbb7082b93',
  requestText: 'fbd2cbf1-8137-4a33-ada2-fe1e775d6dfe',
  requestAnswerText: '1394d3be-852f-4fe9-a8ae-854086afc684',
  requestErrorMessage: '39797886-298c-42d1-9704-dd00e57ec848',
  requestReceivedAt: 'c4da7930-64a7-4116-a14e-8fbc73ddca34',
  requestLastProcessedAt: '2e3a2602-94f2-4862-bca3-dc1888bd959c',
  requestRawPayload: 'dc538914-4a06-414f-923c-3b7057adc73c',
  threadTitle: '1d4e1e95-3cef-4672-838e-d6ddf6dbde3e',
  threadStatus: '828ba59b-53b0-46fe-a5b2-44f8515c6d30',
  threadSlackChannelId: 'cf5d014c-e8f3-4875-b100-c597d19a24db',
  threadSlackThreadTs: '53bb1fbe-b5ef-4a14-a872-d8d962a065f0',
  threadLatestSlackMessageTs: '91a9a27f-1dc1-4ed8-809f-fb7044ac5700',
  threadLatestSlackAgentRequestId: '347e4e2e-addc-4867-8e61-9cad5081e9a0',
  threadSummary: '5f5bba41-a84d-4588-92f5-481bd6215cd2',
  threadPendingApproval: '0e71e842-8eca-4766-8222-5a9d45a00290',
  approvalTitle: 'de7ca56e-ec96-41fa-9762-50f9f9d257f4',
  approvalStatus: 'e1578c68-c449-4bec-87af-a16bf159cc61',
  approvalSlackAgentRequestId: 'ee180036-405b-47b1-b1e2-ba2847c6a1ff',
  approvalSlackApproverUserId: 'e8e6bfa6-7b76-4183-bb7f-f96777b75ca5',
  approvalDecidedAt: 'c76cd7e0-5694-47b2-bd9d-da5ea036a63d',
  approvalSummary: '9f420d11-0b76-4dd2-bdb2-86ab779fb71d',
  approvalActions: 'cec8cc42-1a51-45f2-9468-260171e0d036',
  approvalAppliedResult: '0de1f15a-f7cd-4f6f-a87b-411d6dca05b0',
  toolTraceTitle: 'e97368f5-318e-4a85-b3bd-30057c43f89d',
  toolTraceStatus: 'e84f7ba5-4c65-47ee-87df-254cc1ac1bd0',
  toolTraceToolName: '69853eeb-c883-4750-bad6-483b1da9d3ce',
  toolTraceSlackAgentRequestId: '3371d703-f700-4de8-8710-6df9a515661d',
  toolTraceDurationMs: '505a5d20-7cc4-400d-a955-5138a8492282',
  toolTraceErrorMessage: '330a0a65-8ad4-4633-bce0-949542c63716',
  toolTraceStartedAt: 'dfdc6480-7fc6-44ab-b1c9-c32c622c4eab',
  toolTraceFinishedAt: '03b27dbb-099c-402b-9f86-4fb137677889',
  toolTraceInput: '6d14ad68-7ea4-439c-9b56-04166c188a57',
} as const;
