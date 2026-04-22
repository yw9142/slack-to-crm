import { describe, expect, it } from 'vitest';

import type { JsonRecord } from '../src/types';
import {
  JsonRpcProtocolError,
  TwentyMcpJsonRpcClient,
  parseJsonRpcResponse,
} from '../src/mcp/json-rpc-client';

describe('parseJsonRpcResponse', () => {
  it('returns the result for a valid JSON-RPC success response', () => {
    const result = parseJsonRpcResponse<{ ok: boolean }>(
      {
        id: 1,
        jsonrpc: '2.0',
        result: {
          ok: true,
        },
      },
      1,
    );

    expect(result).toEqual({ ok: true });
  });

  it('throws a protocol error for JSON-RPC error responses', () => {
    expect(() =>
      parseJsonRpcResponse(
        {
          error: {
            code: -32_001,
            data: {
              toolName: 'find_people',
            },
            message: 'Tool failed',
          },
          id: 1,
          jsonrpc: '2.0',
        },
        1,
      ),
    ).toThrow(JsonRpcProtocolError);
  });

  it('throws a protocol error when the response id does not match', () => {
    expect(() =>
      parseJsonRpcResponse(
        {
          id: 2,
          jsonrpc: '2.0',
          result: {},
        },
        1,
      ),
    ).toThrow('JSON-RPC response id mismatch');
  });
});

describe('TwentyMcpJsonRpcClient', () => {
  it('sends bearer auth and parses tools/list responses', async () => {
    const fetchCalls: Array<{
      init?: RequestInit;
      input: RequestInfo | URL;
    }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      fetchCalls.push({ init, input });

      return new Response(
        JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          result: {
            tools: [
              {
                name: 'find_people',
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
    const client = new TwentyMcpJsonRpcClient({
      bearerToken: 'read-token',
      endpointUrl: 'https://mcp.example.test/rpc',
      fetchImpl,
    });

    const result = await client.listTools();

    expect(result.tools).toEqual([{ name: 'find_people' }]);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.input).toBe('https://mcp.example.test/rpc');
    expect(fetchCalls[0]?.init?.headers).toMatchObject({
      Authorization: 'Bearer read-token',
    });

    const body = JSON.parse(
      String(fetchCalls[0]?.init?.body),
    ) as JsonRecord;

    expect(body).toMatchObject({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    });
  });
});
