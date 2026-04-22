export type WorkerEnv = {
  codexAdapterMode: 'cli' | 'deterministic';
  codexBinary: string;
  codexHome?: string;
  codexModel?: string;
  codexWorkingDirectory: string;
  port: number;
  sharedSecret: string;
  slackBotToken?: string;
  twentyMcpUrl: string;
  twentyMcpReadToken: string;
  twentyMcpWriteToken: string;
};

type EnvSource = Record<string, string | undefined>;

const readRequiredEnv = (source: EnvSource, key: string): string => {
  const value = source[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? '8787');

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid worker port: ${value ?? ''}`);
  }

  return port;
};

export const loadWorkerEnv = (
  source: EnvSource = process.env,
): WorkerEnv => ({
  codexAdapterMode:
    source.CODEX_AGENT_MODE === 'deterministic' ? 'deterministic' : 'cli',
  codexBinary: source.CODEX_BINARY ?? 'codex',
  codexHome: source.CODEX_HOME,
  codexModel: source.CODEX_MODEL,
  codexWorkingDirectory: source.CODEX_WORKDIR ?? process.cwd(),
  port: parsePort(source.WORKER_PORT ?? source.PORT),
  sharedSecret:
    source.SLACK_AGENT_SHARED_SECRET ??
    readRequiredEnv(source, 'WORKER_SHARED_SECRET'),
  slackBotToken: source.SLACK_BOT_TOKEN,
  twentyMcpUrl: readRequiredEnv(source, 'TWENTY_MCP_URL'),
  twentyMcpReadToken: readRequiredEnv(source, 'TWENTY_MCP_READ_TOKEN'),
  twentyMcpWriteToken: readRequiredEnv(source, 'TWENTY_MCP_WRITE_TOKEN'),
});
