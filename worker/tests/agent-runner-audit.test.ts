import { describe, expect, it } from 'vitest';

import type { AgentAdapter } from '../src/agent/agent-adapter';
import { AgentRunner } from '../src/agent/agent-runner';
import type { ToolPolicyGateway } from '../src/policy/tool-policy-gateway';
import type {
  AgentToolCall,
  JsonRecord,
  SlackAgentProcessRequest,
} from '../src/types';

describe('AgentRunner audit persistence', () => {
  it('persists Slack request results and per-tool trace rows', async () => {
    const systemWriteCalls: Array<{ arguments: JsonRecord; name: string }> = [];
    let adapterCalls = 0;
    const adapter: AgentAdapter = {
      async run() {
        adapterCalls += 1;

        if (adapterCalls === 1) {
          return {
            assistantMessage: '조회 중입니다.',
            metadata: {},
            toolCalls: [
              {
                arguments: { limit: 1 },
                id: 'tool-call-1',
                name: 'find_companies',
              },
            ],
          };
        }

        return {
          assistantMessage: '다우데이타 회사를 찾았습니다.',
          metadata: { recordReferences: ['company-1'] },
          toolCalls: [],
        };
      },
    };
    const policyGateway = {
      async callReadTool(name: string) {
        return {
          content: [{ text: `${name} result`, type: 'text' }],
        };
      },
      async callSystemWriteTool(name: string, toolArguments: JsonRecord = {}) {
        systemWriteCalls.push({ arguments: toolArguments, name });

        return { id: `${name}-id` };
      },
      async executeToolCall(toolCall: AgentToolCall) {
        return {
          classification: 'read',
          kind: 'tool_result',
          result: {
            content: [{ text: 'company result', type: 'text' }],
          },
          toolCall,
        } as const;
      },
    } as unknown as ToolPolicyGateway;
    const runner = new AgentRunner({
      adapter,
      policyGateway,
    });
    const request: SlackAgentProcessRequest = {
      context: { slackAgentThreadId: 'thread-123' },
      slackAgentRequestId: 'request-123',
      text: '다우데이타 회사 찾아줘',
    };

    const result = await runner.process(request);

    expect(result.status).toBe('completed');
    expect(systemWriteCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          arguments: expect.objectContaining({
            answerText: '다우데이타 회사를 찾았습니다.',
            id: 'request-123',
            status: 'COMPLETED',
          }),
          name: 'update_slack_agent_request',
        }),
        expect.objectContaining({
          arguments: expect.objectContaining({
            input: { limit: 1 },
            slackAgentRequestId: 'request-123',
            slackAgentThreadId: 'thread-123',
            status: 'SUCCEEDED',
            toolName: 'find_companies',
          }),
          name: 'create_slack_agent_tool_trace',
        }),
      ]),
    );
  });
});
