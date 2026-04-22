import { describe, expect, it } from 'vitest';

import type {
  McpToolCallResult,
  TwentyMcpToolClient,
} from '../src/mcp/types';
import { TwentyMcpJsonRpcClient } from '../src/mcp/json-rpc-client';
import { ToolPolicyGateway } from '../src/policy/tool-policy-gateway';
import type { JsonRecord, WriteDraft } from '../src/types';
import { isJsonRecord } from '../src/types';

class RecordingMcpClient implements TwentyMcpToolClient {
  public readonly calls: Array<{
    arguments: JsonRecord;
    name: string;
  }> = [];

  public async callTool(
    name: string,
    toolArguments: JsonRecord = {},
  ): Promise<McpToolCallResult> {
    this.calls.push({
      arguments: toolArguments,
      name,
    });

    return {
      content: [
        {
          text: `${name} result`,
          type: 'text',
        },
      ],
    };
  }
}

const createGateway = () => {
  const readMcpClient = new RecordingMcpClient();
  const writeMcpClient = new RecordingMcpClient();
  const gateway = new ToolPolicyGateway({
    createDraftId: () => 'draft-1',
    now: () => new Date('2026-04-22T00:00:00.000Z'),
    readMcpClient,
    writeMcpClient,
  });

  return {
    gateway,
    readMcpClient,
    writeMcpClient,
  };
};

describe('ToolPolicyGateway', () => {
  it('runs read tools through execute_tool on the read MCP client', async () => {
    const { gateway, readMcpClient, writeMcpClient } = createGateway();

    const result = await gateway.executeToolCall({
      arguments: {
        limit: 5,
      },
      id: 'tool-call-1',
      name: 'find_people',
    });

    expect(result.kind).toBe('tool_result');
    expect(readMcpClient.calls).toEqual([
      {
        arguments: {
          arguments: {
            limit: 5,
          },
          toolName: 'find_people',
        },
        name: 'execute_tool',
      },
    ]);
    expect(writeMcpClient.calls).toHaveLength(0);
  });

  it('passes meta tools through to the read MCP client', async () => {
    const { gateway, readMcpClient, writeMcpClient } = createGateway();

    const result = await gateway.executeToolCall({
      arguments: {
        topic: 'accounts',
      },
      name: 'learn_tools',
    });

    expect(result.kind).toBe('tool_result');
    expect(readMcpClient.calls).toEqual([
      {
        arguments: {
          topic: 'accounts',
        },
        name: 'learn_tools',
      },
    ]);
    expect(writeMcpClient.calls).toHaveLength(0);
  });

  it('intercepts write tools into drafts before approval', async () => {
    const { gateway, readMcpClient, writeMcpClient } = createGateway();

    const result = await gateway.executeToolCall({
      arguments: {
        name: 'Ada Lovelace',
      },
      name: 'create_person',
      reason: 'Create a CRM person from Slack request',
    });

    expect(result.kind).toBe('write_draft');

    if (result.kind !== 'write_draft') {
      throw new Error('Expected write draft result');
    }

    expect(result.draft).toEqual({
      approvalPolicy: 'slack_user_approval_required',
      arguments: {
        name: 'Ada Lovelace',
      },
      createdAt: '2026-04-22T00:00:00.000Z',
      id: 'draft-1',
      reason: 'Create a CRM person from Slack request',
      status: 'pending_approval',
      toolName: 'create_person',
    });
    expect(readMcpClient.calls).toHaveLength(0);
    expect(writeMcpClient.calls).toHaveLength(0);
  });

  it('uses the write bearer token and execute_tool for approved drafts', async () => {
    const fetchCalls: Array<{
      body: JsonRecord;
      headers: Record<string, string>;
    }> = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as JsonRecord;
      const headers = init?.headers as Record<string, string>;

      fetchCalls.push({
        body,
        headers,
      });

      return new Response(
        JSON.stringify({
          id: body.id,
          jsonrpc: '2.0',
          result: {
            content: [
              {
                text: 'applied',
                type: 'text',
              },
            ],
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      );
    };
    const readMcpClient = new TwentyMcpJsonRpcClient({
      bearerToken: 'read-token',
      endpointUrl: 'https://mcp.example.test/rpc',
      fetchImpl,
    });
    const writeMcpClient = new TwentyMcpJsonRpcClient({
      bearerToken: 'write-token',
      endpointUrl: 'https://mcp.example.test/rpc',
      fetchImpl,
    });
    const gateway = new ToolPolicyGateway({
      now: () => new Date('2026-04-22T00:00:00.000Z'),
      readMcpClient,
      writeMcpClient,
    });
    const draft: WriteDraft = {
      approvalPolicy: 'slack_user_approval_required',
      arguments: {
        id: 'person-1',
        name: 'Grace Hopper',
      },
      createdAt: '2026-04-22T00:00:00.000Z',
      id: 'draft-1',
      status: 'pending_approval',
      toolName: 'update_person',
    };

    const result = await gateway.applyApprovedDraft({
      approvalId: 'approval-1',
      approvedBySlackUserId: 'U123',
      draft,
    });

    expect(result.toolName).toBe('execute_tool');
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.headers.Authorization).toBe('Bearer write-token');
    expect(fetchCalls[0]?.body).toMatchObject({
      method: 'tools/call',
    });

    const params = fetchCalls[0]?.body.params;

    expect(isJsonRecord(params)).toBe(true);

    if (!isJsonRecord(params)) {
      throw new Error('Expected JSON-RPC params');
    }

    expect(params.name).toBe('execute_tool');
    expect(params.arguments).toEqual({
      arguments: {
        id: 'person-1',
        name: 'Grace Hopper',
      },
      toolName: 'update_person',
    });
  });
});
