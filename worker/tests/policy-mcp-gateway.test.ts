import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import { PolicyMcpGateway } from '../src/mcp/policy-mcp-gateway';
import { ToolPolicyGateway } from '../src/policy/tool-policy-gateway';
import type { McpToolCallResult, TwentyMcpToolClient } from '../src/mcp/types';
import type { JsonRecord } from '../src/types';

class RecordingMcpClient implements TwentyMcpToolClient {
  public readonly calls: Array<{ arguments: JsonRecord; name: string }> = [];

  public async callTool(
    name: string,
    toolArguments: JsonRecord = {},
  ): Promise<McpToolCallResult> {
    this.calls.push({ arguments: toolArguments, name });

    if (
      name === 'execute_tool' &&
      toolArguments.toolName === 'find_opportunities' &&
      JSON.stringify(toolArguments.arguments).includes('"desc"')
    ) {
      return {
        content: [
          {
            text: JSON.stringify({
              error: 'Invalid enum value "desc" for orderBy direction',
            }),
            type: 'text',
          },
        ],
        isError: true,
      };
    }

    if (name === 'get_tool_catalog') {
      return {
        content: [
          {
            text: JSON.stringify({
              catalog: {
                DATABASE_CRUD: [
                  {
                    description: 'Search companies',
                    name: 'find_companies',
                  },
                  {
                    description: 'Search opportunities',
                    name: 'find_opportunities',
                  },
                  {
                    description: 'Search blocklists',
                    name: 'find_blocklists',
                  },
                ],
                DASHBOARD: [
                  {
                    description: 'List dashboards',
                    name: 'list_dashboards',
                  },
                ],
              },
            }),
            type: 'text',
          },
        ],
      };
    }

    return {
      content: [{ text: `${name} result`, type: 'text' }],
    };
  }
}

describe('PolicyMcpGateway', () => {
  it('rejects unauthenticated session requests', async () => {
    const gateway = createGateway().policyMcpGateway;
    const session = gateway.createSession({
      request: { slackAgentRequestId: 'request-1', text: '회사 조회' },
    });
    const response = createMockResponse();

    await gateway.handleHttpRequest(
      createMockRequest({
        body: {
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
        },
      }),
      response,
      new URL(`http://localhost/mcp/${session.id}`),
    );

    expect(response.statusCode).toBe(401);
  });

  it('proxies read execute_tool calls and records traces', async () => {
    const { policyMcpGateway, readMcpClient, writeMcpClient } = createGateway();
    const session = policyMcpGateway.createSession({
      request: { slackAgentRequestId: 'request-1', text: '회사 조회' },
    });
    const response = createMockResponse();

    await policyMcpGateway.handleHttpRequest(
      createMockRequest({
        authorization: `Bearer ${session.token}`,
        body: {
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            arguments: {
              arguments: { limit: 3 },
              toolName: 'find_companies',
            },
            name: 'execute_tool',
          },
        },
      }),
      response,
      new URL(`http://localhost/mcp/${session.id}`),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      id: 1,
      jsonrpc: '2.0',
      result: {
        content: [{ text: 'execute_tool result', type: 'text' }],
      },
    });
    expect(readMcpClient.calls).toEqual([
      {
        arguments: {
          arguments: { limit: 3 },
          toolName: 'find_companies',
        },
        name: 'execute_tool',
      },
    ]);
    expect(writeMcpClient.calls).toHaveLength(0);

    const sessionResult = policyMcpGateway.getSessionResult(session.id);

    expect(sessionResult.toolResults).toEqual([
      expect.objectContaining({
        input: { limit: 3 },
        kind: 'read',
        toolName: 'find_companies',
      }),
    ]);
  });

  it('turns write execute_tool calls into approval drafts', async () => {
    const { policyMcpGateway, readMcpClient, writeMcpClient } = createGateway();
    const session = policyMcpGateway.createSession({
      request: { slackAgentRequestId: 'request-1', text: '회사 생성' },
    });
    const response = createMockResponse();

    await policyMcpGateway.handleHttpRequest(
      createMockRequest({
        authorization: `Bearer ${session.token}`,
        body: {
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            arguments: {
              arguments: { name: '다우데이타' },
              toolName: 'create_company',
            },
            name: 'execute_tool',
          },
        },
      }),
      response,
      new URL(`http://localhost/mcp/${session.id}`),
    );

    expect(response.statusCode).toBe(200);
    expect(readMcpClient.calls).toHaveLength(0);
    expect(writeMcpClient.calls).toHaveLength(0);

    const sessionResult = policyMcpGateway.getSessionResult(session.id);

    expect(sessionResult.writeDrafts).toEqual([
      expect.objectContaining({
        arguments: { name: '다우데이타' },
        toolName: 'create_company',
      }),
    ]);
    expect(JSON.parse(response.body)).toMatchObject({
      result: {
        content: [
          {
            type: 'text',
          },
        ],
      },
    });
  });

  it('captures bundled submit_approval_draft calls as write drafts', async () => {
    const { policyMcpGateway, readMcpClient, writeMcpClient } = createGateway();
    const session = policyMcpGateway.createSession({
      request: {
        slackAgentRequestId: 'request-1',
        text: '미팅 끝났으니 CRM에 반영할 승인초안 만들어줘',
      },
    });
    const response = createMockResponse();

    await policyMcpGateway.handleHttpRequest(
      createMockRequest({
        authorization: `Bearer ${session.token}`,
        body: {
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            arguments: {
              drafts: [
                {
                  arguments: {
                    id: 'opportunity-1',
                    riskStatus: 'WATCH',
                  },
                  reason: '미팅 후 리스크 완화',
                  toolName: 'update_opportunity',
                },
                {
                  arguments: {
                    body: '보안심의 미팅 노트',
                    title: '동서페이먼츠 미팅 노트',
                  },
                  linkTargets: [
                    {
                      targetFieldName: 'targetOpportunity',
                      targetRecordId: 'opportunity-1',
                    },
                  ],
                  toolName: 'create_note',
                },
              ],
              summary: '동서페이먼츠 미팅 후속조치',
            },
            name: 'submit_approval_draft',
          },
        },
      }),
      response,
      new URL(`http://localhost/mcp/${session.id}`),
    );

    expect(response.statusCode).toBe(200);
    expect(readMcpClient.calls).toHaveLength(0);
    expect(writeMcpClient.calls).toHaveLength(0);

    const responseBody = JSON.parse(response.body) as JsonRecord;
    const result = responseBody.result as JsonRecord;
    const resultText = String(
      (result.content as Array<{ text: string }>)[0]?.text,
    );
    const parsedResult = JSON.parse(resultText) as JsonRecord;

    expect(parsedResult).toMatchObject({
      approvalRequired: true,
      message: expect.stringContaining('Slack approval draft'),
    });

    const sessionResult = policyMcpGateway.getSessionResult(session.id);

    expect(sessionResult.writeDrafts).toEqual([
      expect.objectContaining({
        arguments: {
          id: 'opportunity-1',
          riskStatus: 'WATCH',
        },
        reason: '미팅 후 리스크 완화',
        toolName: 'update_opportunity',
      }),
      expect.objectContaining({
        arguments: {
          body: '보안심의 미팅 노트',
          title: '동서페이먼츠 미팅 노트',
        },
        linkTargets: [
          {
            targetFieldName: 'targetOpportunity',
            targetRecordId: 'opportunity-1',
          },
        ],
        toolName: 'create_note',
      }),
    ]);
    expect(sessionResult.toolResults).toEqual([
      expect.objectContaining({
        kind: 'write_draft',
        toolName: 'update_opportunity',
      }),
      expect.objectContaining({
        kind: 'write_draft',
        toolName: 'create_note',
      }),
    ]);
  });

  it('defaults tool catalog categories by request profile without over-compacting small catalogs', async () => {
    const { policyMcpGateway, readMcpClient } = createGateway();
    const session = policyMcpGateway.createSession({
      request: { slackAgentRequestId: 'request-1', text: '영업 딜 조회' },
    });
    const response = createMockResponse();

    await policyMcpGateway.handleHttpRequest(
      createMockRequest({
        authorization: `Bearer ${session.token}`,
        body: {
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            arguments: {},
            name: 'get_tool_catalog',
          },
        },
      }),
      response,
      new URL(`http://localhost/mcp/${session.id}`),
    );

    expect(readMcpClient.calls).toEqual([
      {
        arguments: { categories: ['DATABASE_CRUD'] },
        name: 'get_tool_catalog',
      },
    ]);

    const body = JSON.parse(response.body) as JsonRecord;
    const result = body.result as McpToolCallResult;
    const text = String(result.content?.[0]?.text);
    const parsedCatalog = JSON.parse(text) as JsonRecord;

    expect(parsedCatalog).toMatchObject({
      catalog: {
        DATABASE_CRUD: [
          expect.objectContaining({ name: 'find_companies' }),
          expect.objectContaining({ name: 'find_opportunities' }),
          expect.objectContaining({ name: 'find_blocklists' }),
        ],
      },
    });
  });

  it('uses dashboard catalog categories for dashboard/reporting requests', async () => {
    const { policyMcpGateway, readMcpClient } = createGateway();
    const session = policyMcpGateway.createSession({
      request: { slackAgentRequestId: 'request-1', text: '영업 대시보드 만들어줘' },
    });
    const response = createMockResponse();

    await policyMcpGateway.handleHttpRequest(
      createMockRequest({
        authorization: `Bearer ${session.token}`,
        body: {
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            arguments: {},
            name: 'get_tool_catalog',
          },
        },
      }),
      response,
      new URL(`http://localhost/mcp/${session.id}`),
    );

    expect(readMcpClient.calls).toEqual([
      {
        arguments: {
          categories: [
            'DATABASE_CRUD',
            'DASHBOARD',
            'VIEW',
            'VIEW_FIELD',
            'METADATA',
          ],
        },
        name: 'get_tool_catalog',
      },
    ]);
  });

  it('wraps MCP tool errors with retry-friendly repair context', async () => {
    const { policyMcpGateway } = createGateway();
    const session = policyMcpGateway.createSession({
      request: { slackAgentRequestId: 'request-1', text: '금액 높은 딜 조회' },
    });
    const response = createMockResponse();

    await policyMcpGateway.handleHttpRequest(
      createMockRequest({
        authorization: `Bearer ${session.token}`,
        body: {
          id: 1,
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            arguments: {
              arguments: { orderBy: [{ amountMicros: 'desc' }] },
              toolName: 'find_opportunities',
            },
            name: 'execute_tool',
          },
        },
      }),
      response,
      new URL(`http://localhost/mcp/${session.id}`),
    );

    const body = JSON.parse(response.body) as JsonRecord;
    const result = body.result as McpToolCallResult;
    const text = String(result.content?.[0]?.text);
    const parsedResult = JSON.parse(text) as JsonRecord;

    expect(result.isError).toBe(true);
    expect(JSON.stringify(parsedResult)).toContain('DescNullsLast');

    const sessionResult = policyMcpGateway.getSessionResult(session.id);

    expect(sessionResult.toolResults).toEqual([
      expect.objectContaining({
        errorHint: expect.stringContaining('DescNullsLast'),
        errorMessage: 'Invalid enum value "desc" for orderBy direction',
        kind: 'read',
        retryCount: 1,
        toolName: 'find_opportunities',
      }),
    ]);
  });
});

const createGateway = () => {
  const readMcpClient = new RecordingMcpClient();
  const writeMcpClient = new RecordingMcpClient();
  const toolPolicyGateway = new ToolPolicyGateway({
    createDraftId: () => 'draft-1',
    now: () => new Date('2026-04-23T00:00:00.000Z'),
    readMcpClient,
    writeMcpClient,
  });
  const policyMcpGateway = new PolicyMcpGateway({
    now: () => new Date('2026-04-23T00:00:00.000Z'),
    policyGateway: toolPolicyGateway,
  });

  return { policyMcpGateway, readMcpClient, writeMcpClient };
};

const createMockRequest = ({
  authorization,
  body,
}: {
  authorization?: string;
  body: JsonRecord;
}): IncomingMessage => {
  const request = new EventEmitter() as IncomingMessage;

  request.headers = authorization ? { authorization } : {};

  queueMicrotask(() => {
    request.emit('data', Buffer.from(JSON.stringify(body)));
    request.emit('end');
  });

  return request;
};

const createMockResponse = (): ServerResponse & {
  body: string;
  statusCode: number;
} => {
  const response = new EventEmitter() as ServerResponse & {
    body: string;
    statusCode: number;
  };

  response.body = '';
  response.statusCode = 200;
  response.setHeader = () => response;
  response.end = (chunk?: unknown) => {
    response.body += chunk ? String(chunk) : '';

    return response;
  };

  return response;
};
