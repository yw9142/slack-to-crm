import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { AgentRunner } from '../agent/agent-runner';
import type {
  AgentToolCall,
  JsonRecord,
  SlackAgentApplyRequest,
  SlackAgentContext,
  SlackAgentProcessRequest,
  WriteDraft,
} from '../types';
import { isJsonRecord } from '../types';
import { isAuthorizedRequest } from './auth';

const DEFAULT_MAX_BODY_BYTES = 1_000_000;

export type WorkerHttpServerOptions = {
  agentRunner: AgentRunner;
  sharedSecret: string;
  maxBodyBytes?: number;
};

class BadRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export const createHttpServer = (options: WorkerHttpServerOptions) =>
  createServer((request, response) => {
    void handleHttpRequest(request, response, options);
  });

export const handleHttpRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  options: WorkerHttpServerOptions,
): Promise<void> => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    if (
      url.pathname !== '/internal/slack-agent/process' &&
      url.pathname !== '/internal/slack-agent/apply'
    ) {
      writeJson(response, 404, { error: 'Not found' });
      return;
    }

    if (!isAuthorizedRequest(request.headers, options.sharedSecret)) {
      writeJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    const body = await readJsonBody(
      request,
      options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    );

    if (url.pathname === '/internal/slack-agent/process') {
      const result = await options.agentRunner.process(parseProcessRequest(body));
      writeJson(response, 200, result);
      return;
    }

    const result = await options.agentRunner.apply(parseApplyRequest(body));
    writeJson(response, 200, result);
  } catch (error) {
    if (error instanceof BadRequestError) {
      writeJson(response, 400, { error: error.message });
      return;
    }

    writeJson(response, 500, { error: 'Internal server error' });
  }
};

const readJsonBody = (
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    request.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;

      if (totalBytes > maxBodyBytes) {
        reject(new BadRequestError('Request body is too large'));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => {
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        resolve(rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown));
      } catch {
        reject(new BadRequestError('Request body must be valid JSON'));
      }
    });

    request.on('error', reject);
  });

const parseProcessRequest = (body: unknown): SlackAgentProcessRequest => {
  if (!isJsonRecord(body)) {
    throw new BadRequestError('Process request body must be an object');
  }

  const slackAgentRequestId =
    readString(body, 'slackAgentRequestId') ?? readString(body, 'requestId');

  if (slackAgentRequestId === undefined) {
    throw new BadRequestError('Process request requires slackAgentRequestId');
  }

  return {
    context: readRecord(body, 'context'),
    requestId: readString(body, 'requestId') ?? slackAgentRequestId,
    slack: parseSlackContext(body),
    slackAgentRequestId,
    text: readString(body, 'text') ?? readString(body, 'slackMessageText'),
    toolCalls: parseToolCalls(body.toolCalls),
  };
};

const parseApplyRequest = (body: unknown): SlackAgentApplyRequest => {
  if (!isJsonRecord(body)) {
    throw new BadRequestError('Apply request body must be an object');
  }

  return {
    approvalId: readString(body, 'approvalId'),
    approvedBySlackUserId: readString(body, 'approvedBySlackUserId'),
    draft: body.draft === undefined ? undefined : parseWriteDraft(body.draft),
    slackAgentApprovalId:
      readString(body, 'slackAgentApprovalId') ?? readString(body, 'approvalId'),
    slackAgentRequestId: readString(body, 'slackAgentRequestId'),
  };
};

const parseSlackContext = (
  body: JsonRecord,
): SlackAgentContext | undefined => {
  const slack = readRecord(body, 'slack');
  const source = slack ?? body;
  const context: SlackAgentContext = {
    channelId:
      readString(source, 'channelId') ?? readString(source, 'slackChannelId'),
    messageTs:
      readString(source, 'messageTs') ?? readString(source, 'slackMessageTs'),
    teamId: readString(source, 'teamId') ?? readString(source, 'slackTeamId'),
    threadTs:
      readString(source, 'threadTs') ?? readString(source, 'slackThreadTs'),
    userId: readString(source, 'userId') ?? readString(source, 'slackUserId'),
  };

  if (
    context.teamId === undefined &&
    context.channelId === undefined &&
    context.userId === undefined &&
    context.messageTs === undefined &&
    context.threadTs === undefined
  ) {
    return undefined;
  }

  return context;
};

const parseToolCalls = (value: unknown): AgentToolCall[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestError('toolCalls must be an array');
  }

  return value.map((item) => {
    if (!isJsonRecord(item)) {
      throw new BadRequestError('Each tool call must be an object');
    }

    const name = readString(item, 'name');

    if (name === undefined) {
      throw new BadRequestError('Each tool call requires a name');
    }

    return {
      arguments: readRecord(item, 'arguments'),
      id: readString(item, 'id'),
      name,
      reason: readString(item, 'reason'),
    };
  });
};

const parseWriteDraft = (value: unknown): WriteDraft => {
  if (!isJsonRecord(value)) {
    throw new BadRequestError('Apply request requires draft');
  }

  const id = readString(value, 'id');
  const toolName = readString(value, 'toolName');
  const createdAt = readString(value, 'createdAt');

  if (id === undefined || toolName === undefined || createdAt === undefined) {
    throw new BadRequestError('Draft requires id, toolName, and createdAt');
  }

  return {
    approvalPolicy: 'slack_user_approval_required',
    arguments: readRecord(value, 'arguments') ?? {},
    createdAt,
    id,
    reason: readString(value, 'reason'),
    status: 'pending_approval',
    toolName,
  };
};

const readString = (
  record: JsonRecord,
  key: string,
): string | undefined => {
  const value = record[key];

  return typeof value === 'string' ? value : undefined;
};

const readRecord = (
  record: JsonRecord,
  key: string,
): JsonRecord | undefined => {
  const value = record[key];

  return isJsonRecord(value) ? value : undefined;
};

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  body: JsonRecord,
): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};
