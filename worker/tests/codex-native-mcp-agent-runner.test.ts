import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CodexNativeMcpAgentRunner } from '../src/agent/codex-native-mcp-agent-runner';
import { PolicyMcpGateway } from '../src/mcp/policy-mcp-gateway';
import type { McpToolCallResult, TwentyMcpToolClient } from '../src/mcp/types';
import { ToolPolicyGateway } from '../src/policy/tool-policy-gateway';
import type { JsonRecord } from '../src/types';

class RecordingMcpClient implements TwentyMcpToolClient {
  public readonly calls: Array<{ arguments: JsonRecord; name: string }> = [];

  public async callTool(
    name: string,
    toolArguments: JsonRecord = {},
  ): Promise<McpToolCallResult> {
    this.calls.push({ arguments: toolArguments, name });

    return {
      content: [{ text: `${name} result`, type: 'text' }],
    };
  }
}

describe('CodexNativeMcpAgentRunner', () => {
  const originalTwentyMcpReadToken = process.env.TWENTY_MCP_READ_TOKEN;

  afterEach(() => {
    process.env.TWENTY_MCP_READ_TOKEN = originalTwentyMcpReadToken;
  });

  it('runs Codex with only the session policy MCP token exposed', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'fake-codex-'));
    const fakeCodexPath = join(tempDirectory, 'fake-codex.cjs');
    const invocationPath = join(tempDirectory, 'invocation.json');

    await writeFile(
      fakeCodexPath,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output-last-message');
if (outputIndex < 0) process.exit(11);
if (!args.includes('--ignore-user-config')) process.exit(12);
if (!args.some((arg) => arg.includes('mcp_servers.slack_crm_policy.url'))) process.exit(13);
if (!args.some((arg) => arg.includes('default_tools_approval_mode="approve"'))) process.exit(16);
const modelIndex = args.indexOf('--model');
if (modelIndex < 0 || args[modelIndex + 1] !== 'gpt-5.4') process.exit(17);
if (!args.some((arg) => arg === 'model_reasoning_effort="high"')) process.exit(18);
if (process.env.TWENTY_MCP_READ_TOKEN) process.exit(14);
if (!process.env.SLACK_CRM_POLICY_MCP_TOKEN) process.exit(15);
fs.writeFileSync(${JSON.stringify(invocationPath)}, JSON.stringify({ args, token: process.env.SLACK_CRM_POLICY_MCP_TOKEN }));
fs.writeFileSync(args[outputIndex + 1], '*CRM native MCP 응답*');
`,
    );
    await chmod(fakeCodexPath, 0o755);

    process.env.TWENTY_MCP_READ_TOKEN = 'do-not-leak';

    const readMcpClient = new RecordingMcpClient();
    const writeMcpClient = new RecordingMcpClient();
    const policyGateway = new ToolPolicyGateway({
      readMcpClient,
      writeMcpClient,
    });
    const policyMcpGateway = new PolicyMcpGateway({ policyGateway });
    const runner = new CodexNativeMcpAgentRunner({
      codexBinary: fakeCodexPath,
      model: 'gpt-5.4',
      policyGateway,
      policyMcpBaseUrl: 'http://127.0.0.1:8787',
      policyMcpGateway,
      reasoningEffort: 'high',
      workingDirectory: tempDirectory,
    });

    try {
      const result = await runner.process({
        slackAgentRequestId: 'request-1',
        text: '일일 영업 가이드',
      });

      expect(result.assistantMessage).toBe('*CRM native MCP 응답*');
      expect(result.metadata).toMatchObject({
        agentEngine: 'native-mcp',
        promptProfile: 'daily-sales-guide',
      });
      expect(writeMcpClient.calls).toEqual([
        expect.objectContaining({
          arguments: expect.objectContaining({
            arguments: expect.objectContaining({
              answerText: '*CRM native MCP 응답*',
              id: 'request-1',
              status: 'COMPLETED',
            }),
            toolName: 'update_slack_agent_request',
          }),
          name: 'execute_tool',
        }),
      ]);

      const invocation = JSON.parse(
        await readFile(invocationPath, 'utf8'),
      ) as JsonRecord;

      expect(typeof invocation.token).toBe('string');
      expect(String(invocation.token).length).toBeGreaterThan(20);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });
});
