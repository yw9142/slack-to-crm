import type { Server } from 'node:http';

import { createAgentRunner } from './app';
import { loadWorkerEnv } from './config/env';
import { createHttpServer } from './http/server';

export const startWorker = (): Server => {
  const env = loadWorkerEnv();
  const server = createHttpServer({
    agentRunner: createAgentRunner({ env }),
    sharedSecret: env.sharedSecret,
  });

  server.listen(env.port, () => {
    console.log(`slack-to-crm worker listening on port ${env.port}`);
  });

  return server;
};

if (require.main === module) {
  startWorker();
}
