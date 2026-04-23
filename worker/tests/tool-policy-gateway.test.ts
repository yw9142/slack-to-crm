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

    if (
      name === 'execute_tool' &&
      toolArguments.toolName === 'create_note'
    ) {
      return {
        content: [
          {
            text: JSON.stringify({
              recordReferences: [
                {
                  displayName: '미팅 노트',
                  objectNameSingular: 'note',
                  recordId: '11111111-1111-4111-8111-111111111111',
                },
              ],
              result: {
                id: '11111111-1111-4111-8111-111111111111',
              },
            }),
            type: 'text',
          },
        ],
      };
    }

    if (
      name === 'execute_tool' &&
      toolArguments.toolName === 'create_many_tasks'
    ) {
      return {
        content: [
          {
            text: JSON.stringify({
              result: [
                { id: '22222222-2222-4222-8222-222222222222' },
                { id: '33333333-3333-4333-8333-333333333333' },
              ],
            }),
            type: 'text',
          },
        ],
      };
    }

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

  it('runs core-style execute_tool read calls through the read MCP client', async () => {
    const { gateway, readMcpClient, writeMcpClient } = createGateway();

    const result = await gateway.executeToolCall({
      arguments: {
        arguments: {
          limit: 5,
        },
        toolName: 'find_people',
      },
      id: 'tool-call-1',
      name: 'execute_tool',
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

  it('intercepts core-style execute_tool write calls into drafts before approval', async () => {
    const { gateway, readMcpClient, writeMcpClient } = createGateway();

    const result = await gateway.executeToolCall({
      arguments: {
        arguments: {
          name: 'Ada Lovelace',
        },
        toolName: 'create_person',
      },
      name: 'execute_tool',
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

  it('moves inline note/task target fields into draft link target metadata', async () => {
    const { gateway } = createGateway();

    const result = await gateway.executeToolCall({
      arguments: {
        body: '고객 미팅 노트',
        targetOpportunity: 'opportunity-1',
        title: '미팅 노트',
      },
      name: 'create_note',
      reason: 'Create a CRM note linked to the opportunity',
    });

    expect(result.kind).toBe('write_draft');

    if (result.kind !== 'write_draft') {
      throw new Error('Expected write draft result');
    }

    expect(result.draft).toMatchObject({
      arguments: {
        body: '고객 미팅 노트',
        title: '미팅 노트',
      },
      linkTargets: [
        {
          targetFieldName: 'targetOpportunity',
          targetRecordId: 'opportunity-1',
        },
      ],
      toolName: 'create_note',
    });
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

  it('creates note target records after approved note drafts with link targets', async () => {
    const { gateway, writeMcpClient } = createGateway();
    const draft: WriteDraft = {
      approvalPolicy: 'slack_user_approval_required',
      arguments: {
        body: '보안심의 미팅 내용',
        title: '미팅 노트',
      },
      createdAt: '2026-04-22T00:00:00.000Z',
      id: 'draft-note',
      linkTargets: [
        {
          targetFieldName: 'targetOpportunity',
          targetRecordId: 'opportunity-1',
        },
        {
          targetFieldName: 'targetPerson',
          targetRecordId: 'person-1',
        },
      ],
      status: 'pending_approval',
      toolName: 'create_note',
    };

    const results = await gateway.applyApprovedDraftWithRelations({
      approvalId: 'approval-1',
      approvedBySlackUserId: 'U123',
      draft,
    });

    expect(results).toHaveLength(2);
    expect(writeMcpClient.calls).toEqual([
      {
        arguments: {
          arguments: {
            body: '보안심의 미팅 내용',
            title: '미팅 노트',
          },
          toolName: 'create_note',
        },
        name: 'execute_tool',
      },
      {
        arguments: {
          arguments: {
            records: [
              {
                noteId: '11111111-1111-4111-8111-111111111111',
                position: 'first',
                targetOpportunityId: 'opportunity-1',
              },
              {
                noteId: '11111111-1111-4111-8111-111111111111',
                position: 'first',
                targetPersonId: 'person-1',
              },
            ],
          },
          toolName: 'create_many_note_targets',
        },
        name: 'execute_tool',
      },
    ]);
  });

  it('creates task target records for every approved created task', async () => {
    const { gateway, writeMcpClient } = createGateway();
    const draft: WriteDraft = {
      approvalPolicy: 'slack_user_approval_required',
      arguments: {
        records: [
          { title: '보완자료 발송' },
          { title: '후속 미팅 예약' },
        ],
      },
      createdAt: '2026-04-22T00:00:00.000Z',
      id: 'draft-task',
      linkTargets: [
        {
          targetFieldName: 'targetOpportunity',
          targetRecordId: 'opportunity-1',
        },
      ],
      status: 'pending_approval',
      toolName: 'create_many_tasks',
    };

    const results = await gateway.applyApprovedDraftWithRelations({
      approvalId: 'approval-1',
      approvedBySlackUserId: 'U123',
      draft,
    });

    expect(results).toHaveLength(2);
    expect(writeMcpClient.calls[1]).toEqual({
      arguments: {
        arguments: {
          records: [
            {
              position: 'first',
              targetOpportunityId: 'opportunity-1',
              taskId: '22222222-2222-4222-8222-222222222222',
            },
            {
              position: 'first',
              targetOpportunityId: 'opportunity-1',
              taskId: '33333333-3333-4333-8333-333333333333',
            },
          ],
        },
        toolName: 'create_many_task_targets',
      },
      name: 'execute_tool',
    });
  });
});
