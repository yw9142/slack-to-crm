import { defineApplication } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  APPLICATION_VARIABLE_UNIVERSAL_IDENTIFIERS,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  applicationVariables: {
    SLACK_SIGNING_SECRET: {
      universalIdentifier:
        APPLICATION_VARIABLE_UNIVERSAL_IDENTIFIERS.slackSigningSecret,
      description: 'Slack signing secret used to verify ingress requests.',
      value: '',
      isSecret: true,
    },
    SLACK_BOT_TOKEN: {
      universalIdentifier: APPLICATION_VARIABLE_UNIVERSAL_IDENTIFIERS.slackBotToken,
      description: 'Slack bot token for worker-owned Slack API calls.',
      value: '',
      isSecret: true,
    },
    SLACK_ALLOWED_CHANNEL_IDS: {
      universalIdentifier:
        APPLICATION_VARIABLE_UNIVERSAL_IDENTIFIERS.slackAllowedChannelIds,
      description: 'Comma-separated Slack channel IDs allowed to use this app.',
      value: '',
      isSecret: false,
    },
    WORKER_BASE_URL: {
      universalIdentifier: APPLICATION_VARIABLE_UNIVERSAL_IDENTIFIERS.workerBaseUrl,
      description: 'Base URL for the Slack agent worker.',
      value: '',
      isSecret: false,
    },
    WORKER_SHARED_SECRET: {
      universalIdentifier:
        APPLICATION_VARIABLE_UNIVERSAL_IDENTIFIERS.workerSharedSecret,
      description: 'Shared secret sent from Twenty routes to the worker.',
      value: '',
      isSecret: true,
    },
    TWENTY_PUBLIC_URL: {
      universalIdentifier: APPLICATION_VARIABLE_UNIVERSAL_IDENTIFIERS.twentyPublicUrl,
      description: 'Public URL of the Twenty instance hosting this app.',
      value: '',
      isSecret: false,
    },
  },
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
});
