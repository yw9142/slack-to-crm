import type { Server } from 'node:http';

import { createWorkerApp } from './app';
import { loadWorkerEnv } from './config/env';
import { createHttpServer } from './http/server';

export const startWorker = (): Server => {
  const env = loadWorkerEnv();
  const app = createWorkerApp({ env });
  const server = createHttpServer({
    agentRunner: app.agentRunner,
    policyMcpGateway: app.policyMcpGateway,
    sharedSecret: env.sharedSecret,
    slackBotToken: env.slackBotToken,
  });

  server.listen(env.port, () => {
    console.log(
      `slack-to-crm worker listening on port ${env.port} (${env.agentEngine})`,
    );
  });

  return server;
};

if (require.main === module) {
  startWorker();
}
