import {
  CodexCliAgentAdapter,
  DeterministicAgentAdapter,
} from './agent/agent-adapter';
import { AgentRunner } from './agent/agent-runner';
import type { WorkerEnv } from './config/env';
import { TwentyMcpJsonRpcClient } from './mcp/json-rpc-client';
import { ToolPolicyGateway } from './policy/tool-policy-gateway';

export type CreateAgentRunnerOptions = {
  env: WorkerEnv;
  fetchImpl?: typeof fetch;
};

export const createAgentRunner = (
  options: CreateAgentRunnerOptions,
): AgentRunner => {
  const readMcpClient = new TwentyMcpJsonRpcClient({
    bearerToken: options.env.twentyMcpReadToken,
    endpointUrl: options.env.twentyMcpUrl,
    fetchImpl: options.fetchImpl,
  });
  const writeMcpClient = new TwentyMcpJsonRpcClient({
    bearerToken: options.env.twentyMcpWriteToken,
    endpointUrl: options.env.twentyMcpUrl,
    fetchImpl: options.fetchImpl,
  });
  const policyGateway = new ToolPolicyGateway({
    readMcpClient,
    writeMcpClient,
  });
  const adapter =
    options.env.codexAdapterMode === 'deterministic'
      ? new DeterministicAgentAdapter()
      : new CodexCliAgentAdapter({
          codexBinary: options.env.codexBinary,
          codexHome: options.env.codexHome,
          model: options.env.codexModel,
          workingDirectory: options.env.codexWorkingDirectory,
        });

  return new AgentRunner({
    adapter,
    policyGateway,
  });
};
