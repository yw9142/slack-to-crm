import type { JsonRecord } from '../types';
import { isJsonRecord } from '../types';
import type {
  McpInitializeResult,
  McpListToolsResult,
  McpToolCallResult,
  TwentyMcpToolClient,
} from './types';

export type JsonRpcId = string | number;

export type JsonRpcErrorBody = {
  code: number;
  message: string;
  data?: unknown;
};

type JsonRpcClientInfo = {
  name: string;
  version: string;
};

type JsonRpcClientOptions = {
  endpointUrl: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
  clientInfo?: JsonRpcClientInfo;
};

export class JsonRpcProtocolError extends Error {
  public readonly code?: number;
  public readonly data?: unknown;

  public constructor(message: string, options?: JsonRpcErrorBody) {
    super(message);
    this.name = 'JsonRpcProtocolError';
    this.code = options?.code;
    this.data = options?.data;
  }
}

export class JsonRpcHttpError extends Error {
  public readonly status: number;
  public readonly body: string;

  public constructor(status: number, body: string) {
    super(`JSON-RPC HTTP request failed with status ${status}`);
    this.name = 'JsonRpcHttpError';
    this.status = status;
    this.body = body;
  }
}

const isJsonRpcId = (value: unknown): value is JsonRpcId =>
  typeof value === 'string' || typeof value === 'number';

const isJsonRpcErrorBody = (value: unknown): value is JsonRpcErrorBody =>
  isJsonRecord(value) &&
  typeof value.code === 'number' &&
  typeof value.message === 'string';

const assertExpectedId = (
  payload: JsonRecord,
  expectedId: JsonRpcId,
): void => {
  if (payload.id !== expectedId) {
    throw new JsonRpcProtocolError('JSON-RPC response id mismatch');
  }
};

export const parseJsonRpcResponse = <TResult>(
  payload: unknown,
  expectedId?: JsonRpcId,
): TResult => {
  if (!isJsonRecord(payload) || payload.jsonrpc !== '2.0') {
    throw new JsonRpcProtocolError('Invalid JSON-RPC response envelope');
  }

  if (expectedId !== undefined) {
    assertExpectedId(payload, expectedId);
  } else if (!isJsonRpcId(payload.id) && payload.id !== null) {
    throw new JsonRpcProtocolError('Invalid JSON-RPC response id');
  }

  if ('error' in payload) {
    if (!isJsonRpcErrorBody(payload.error)) {
      throw new JsonRpcProtocolError('Invalid JSON-RPC error body');
    }

    throw new JsonRpcProtocolError(payload.error.message, payload.error);
  }

  if (!('result' in payload)) {
    throw new JsonRpcProtocolError('JSON-RPC response is missing result');
  }

  return payload.result as TResult;
};

export class TwentyMcpJsonRpcClient implements TwentyMcpToolClient {
  private readonly endpointUrl: string;
  private readonly bearerToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly clientInfo: JsonRpcClientInfo;
  private nextRequestId = 1;

  public constructor(options: JsonRpcClientOptions) {
    this.endpointUrl = options.endpointUrl;
    this.bearerToken = options.bearerToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clientInfo = options.clientInfo ?? {
      name: 'slack-to-crm-worker',
      version: '0.1.0',
    };
  }

  public initialize(
    params: JsonRecord = {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: this.clientInfo,
    },
  ): Promise<McpInitializeResult> {
    return this.send<McpInitializeResult>('initialize', params);
  }

  public listTools(cursor?: string): Promise<McpListToolsResult> {
    const params = typeof cursor === 'string' ? { cursor } : {};

    return this.send<McpListToolsResult>('tools/list', params);
  }

  public callTool(
    name: string,
    toolArguments: JsonRecord = {},
  ): Promise<McpToolCallResult> {
    return this.send<McpToolCallResult>('tools/call', {
      name,
      arguments: toolArguments,
    });
  }

  private async send<TResult>(
    method: string,
    params: JsonRecord,
  ): Promise<TResult> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (this.bearerToken !== undefined) {
      headers.Authorization = `Bearer ${this.bearerToken}`;
    }

    const response = await this.fetchImpl(this.endpointUrl, {
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }),
      headers,
      method: 'POST',
    });

    if (!response.ok) {
      throw new JsonRpcHttpError(response.status, await response.text());
    }

    const payload = (await response.json()) as unknown;

    return parseJsonRpcResponse<TResult>(payload, id);
  }
}
