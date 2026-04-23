import {
  CodexCliAgentAdapter,
  DeterministicAgentAdapter,
} from './agent/agent-adapter';
import { AgentRunner } from './agent/agent-runner';
import type { AgentService } from './agent/agent-service';
import { CodexNativeMcpAgentRunner } from './agent/codex-native-mcp-agent-runner';
import type { WorkerEnv } from './config/env';
import { TwentyMcpJsonRpcClient } from './mcp/json-rpc-client';
import { PolicyMcpGateway } from './mcp/policy-mcp-gateway';
import { ToolPolicyGateway } from './policy/tool-policy-gateway';

export type CreateAgentRunnerOptions = {
  env: WorkerEnv;
  fetchImpl?: typeof fetch;
};

export type WorkerApp = {
  agentRunner: AgentService;
  policyMcpGateway: PolicyMcpGateway;
};

export const createWorkerApp = (options: CreateAgentRunnerOptions): WorkerApp => {
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
  const policyMcpGateway = new PolicyMcpGateway({
    policyGateway,
  });

  if (options.env.agentEngine === 'native-mcp') {
    return {
      agentRunner: new CodexNativeMcpAgentRunner({
        codexBinary: options.env.codexBinary,
        codexHome: options.env.codexHome,
        model: options.env.codexModel,
        policyGateway,
        policyMcpBaseUrl: `http://127.0.0.1:${options.env.port}`,
        policyMcpGateway,
        timeoutMs: options.env.codexTimeoutMs,
        workingDirectory: options.env.codexWorkingDirectory,
      }),
      policyMcpGateway,
    };
  }

  const adapter =
    options.env.agentEngine === 'deterministic'
      ? new DeterministicAgentAdapter()
      : new CodexCliAgentAdapter({
          codexBinary: options.env.codexBinary,
          codexHome: options.env.codexHome,
          model: options.env.codexModel,
          timeoutMs: options.env.codexTimeoutMs,
          workingDirectory: options.env.codexWorkingDirectory,
        });

  return {
    agentRunner: new AgentRunner({
      adapter,
      policyGateway,
    }),
    policyMcpGateway,
  };
};

export const createAgentRunner = (
  options: CreateAgentRunnerOptions,
): AgentService => {
  return createWorkerApp(options).agentRunner;
};

export const createLegacyAgentRunner = (
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
          timeoutMs: options.env.codexTimeoutMs,
          workingDirectory: options.env.codexWorkingDirectory,
        });

  return new AgentRunner({
    adapter,
    policyGateway,
  });
};
