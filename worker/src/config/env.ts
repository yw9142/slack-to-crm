export type WorkerEnv = {
  agentEngine: 'native-mcp' | 'legacy-json-loop' | 'deterministic';
  agentQualityMode: 'core-parity' | 'legacy';
  codexAdapterMode: 'cli' | 'deterministic';
  codexBinary: string;
  codexHome?: string;
  codexModel?: string;
  codexReasoningEffort: string;
  codexTimeoutMs: number;
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

const parsePositiveInteger = (
  value: string | undefined,
  defaultValue: number,
): number => {
  const parsedValue = Number(value ?? String(defaultValue));

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid positive integer: ${value ?? ''}`);
  }

  return parsedValue;
};

export const loadWorkerEnv = (
  source: EnvSource = process.env,
): WorkerEnv => ({
  agentEngine: parseAgentEngine(source),
  agentQualityMode:
    source.AGENT_QUALITY_MODE === 'legacy' ? 'legacy' : 'core-parity',
  codexAdapterMode:
    source.CODEX_AGENT_MODE === 'deterministic' ? 'deterministic' : 'cli',
  codexBinary: source.CODEX_BINARY ?? 'codex',
  codexHome: source.CODEX_HOME,
  codexModel: source.CODEX_MODEL ?? 'gpt-5.4',
  codexReasoningEffort: source.CODEX_REASONING_EFFORT ?? 'high',
  codexTimeoutMs: parsePositiveInteger(source.CODEX_TIMEOUT_MS, 900_000),
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

const parseAgentEngine = (
  source: EnvSource,
): WorkerEnv['agentEngine'] => {
  if (source.CODEX_AGENT_MODE === 'deterministic') {
    return 'deterministic';
  }

  if (source.AGENT_ENGINE === 'legacy-json-loop') {
    return 'legacy-json-loop';
  }

  if (source.AGENT_ENGINE === 'deterministic') {
    return 'deterministic';
  }

  return 'native-mcp';
};
