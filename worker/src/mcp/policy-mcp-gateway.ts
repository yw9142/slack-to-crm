import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';

import type { McpToolCallResult } from './types';
import {
  getCatalogCategoriesForProfile,
  selectCoreParityProfile,
  type AgentPromptProfile,
} from '../agent/core-parity-profiles';
import type {
  AgentToolCall,
  JsonRecord,
  SlackAgentProcessRequest,
  ToolExecutionRecord,
  WriteDraft,
} from '../types';
import type { ToolPolicyGateway } from '../policy/tool-policy-gateway';
import {
  getEffectiveToolArguments,
  getEffectiveToolName,
  isJsonRecord,
  normalizeJsonRecord,
} from '../policy/tool-execution-record';
import { classifyToolName } from '../policy/tool-policy-gateway';

type JsonRpcId = string | number | null;

type PolicyMcpSession = {
  createdAt: Date;
  id: string;
  profile: AgentPromptProfile;
  request: SlackAgentProcessRequest;
  token: string;
  toolResults: ToolExecutionRecord[];
  writeDrafts: WriteDraft[];
};

type PolicyMcpGatewayOptions = {
  now?: () => Date;
  policyGateway: ToolPolicyGateway;
};

type PolicyMcpCreateSessionInput = {
  request: SlackAgentProcessRequest;
};

export type PolicyMcpSessionHandle = {
  id: string;
  token: string;
};

export class PolicyMcpGateway {
  private readonly now: () => Date;
  private readonly policyGateway: ToolPolicyGateway;
  private readonly sessions = new Map<string, PolicyMcpSession>();

  public constructor(options: PolicyMcpGatewayOptions) {
    this.now = options.now ?? (() => new Date());
    this.policyGateway = options.policyGateway;
  }

  public createSession(
    input: PolicyMcpCreateSessionInput,
  ): PolicyMcpSessionHandle {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');

    this.sessions.set(id, {
      createdAt: this.now(),
      id,
      profile: selectCoreParityProfile(input.request.text),
      request: input.request,
      token,
      toolResults: [],
      writeDrafts: [],
    });

    return { id, token };
  }

  public getSessionResult(id: string): {
    toolResults: ToolExecutionRecord[];
    writeDrafts: WriteDraft[];
  } {
    const session = this.sessions.get(id);

    if (!session) {
      return { toolResults: [], writeDrafts: [] };
    }

    return {
      toolResults: [...session.toolResults],
      writeDrafts: [...session.writeDrafts],
    };
  }

  public deleteSession(id: string): void {
    this.sessions.delete(id);
  }

  public async handleHttpRequest(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> {
    const sessionId = decodeURIComponent(url.pathname.replace(/^\/mcp\//, ''));
    const session = this.sessions.get(sessionId);

    if (!session) {
      writeJson(response, 404, {
        error: {
          code: -32_001,
          message: 'Unknown MCP policy session',
        },
        id: null,
        jsonrpc: '2.0',
      });
      return;
    }

    if (!isAuthorizedMcpRequest(request.headers, session.token)) {
      writeJson(response, 401, {
        error: {
          code: -32_000,
          message: 'Unauthorized MCP policy session',
        },
        id: null,
        jsonrpc: '2.0',
      });
      return;
    }

    const body = await readJsonBody(request, 1_000_000);
    const rpcItems = Array.isArray(body) ? body : [body];
    const responses = (
      await Promise.all(
        rpcItems.map((rpcItem) => this.handleJsonRpcItem(session, rpcItem)),
      )
    ).filter((item): item is JsonRecord => item !== null);

    if (responses.length === 0) {
      response.statusCode = 202;
      response.end();
      return;
    }

    writeJson(response, 200, Array.isArray(body) ? responses : responses[0]);
  }

  private async handleJsonRpcItem(
    session: PolicyMcpSession,
    body: unknown,
  ): Promise<JsonRecord | null> {
    if (!isJsonRecord(body) || body.jsonrpc !== '2.0') {
      return jsonRpcError(null, -32_600, 'Invalid JSON-RPC request');
    }

    const id = readJsonRpcId(body.id);
    const method = typeof body.method === 'string' ? body.method : undefined;

    if (id === undefined) {
      return null;
    }

    if (!method) {
      return jsonRpcError(id, -32_600, 'JSON-RPC method is required');
    }

    try {
      if (method === 'initialize') {
        return jsonRpcResult(id, {
          capabilities: {
            prompts: { listChanged: false },
            resources: { listChanged: false },
            tools: { listChanged: false },
          },
          instructions: POLICY_MCP_INSTRUCTIONS,
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'slack-to-crm-policy-mcp',
            version: '0.2.0',
          },
        });
      }

      if (method === 'ping') {
        return jsonRpcResult(id, {});
      }

      if (method === 'prompts/list') {
        return jsonRpcResult(id, { prompts: [] });
      }

      if (method === 'resources/list') {
        return jsonRpcResult(id, { resources: [] });
      }

      if (method === 'tools/list') {
        return jsonRpcResult(id, {
          tools: POLICY_MCP_TOOLS,
        });
      }

      if (method === 'tools/call') {
        const params = isJsonRecord(body.params) ? body.params : {};
        const toolName = typeof params.name === 'string' ? params.name : '';
        const toolArguments = isJsonRecord(params.arguments)
          ? params.arguments
          : {};

        if (!toolName) {
          return jsonRpcError(id, -32_602, 'tools/call requires params.name');
        }

        const result = await this.callPolicyTool(
          session,
          toolName,
          toolArguments,
        );

        return jsonRpcResult(id, result);
      }

      return jsonRpcError(id, -32_601, `Method '${method}' not found`);
    } catch (error) {
      return jsonRpcError(
        id,
        -32_603,
        error instanceof Error ? error.message : 'Policy MCP tool failed',
      );
    }
  }

  private async callPolicyTool(
    session: PolicyMcpSession,
    toolName: string,
    toolArguments: JsonRecord,
  ): Promise<McpToolCallResult> {
    if (toolName === 'submit_approval_draft') {
      return this.submitApprovalDrafts(session, toolArguments);
    }

    const startedAt = this.now();
    const normalizedToolArguments = withPolicyToolDefaults(
      toolName,
      toolArguments,
      session.profile,
    );
    const toolCall: AgentToolCall = {
      arguments: normalizedToolArguments,
      id: randomUUID(),
      name: toolName,
      reason: readReason(normalizedToolArguments),
    };
    const policyResult = await this.policyGateway.executeToolCall(toolCall);
    const finishedAt = this.now();
    const effectiveToolName = getEffectiveToolName(toolCall);
    const effectiveToolArguments = getEffectiveToolArguments(toolCall);
    const traceMetadata = {
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      finishedAt: finishedAt.toISOString(),
      input: effectiveToolArguments,
      policySessionId: session.id,
      promptProfile: session.profile,
      startedAt: startedAt.toISOString(),
    };

    if (policyResult.kind === 'tool_result') {
      const result =
        effectiveToolName === 'get_tool_catalog'
          ? shapeToolCatalogForRequest(
              policyResult.result,
              session.request.text,
              session.profile,
            )
          : policyResult.result;
      const repair = buildRepairContext({
        arguments: effectiveToolArguments,
        result,
        toolName: effectiveToolName,
      });
      const previousFailureCount = session.toolResults.filter(
        (toolResult) =>
          toolResult.toolName === effectiveToolName && toolResult.errorMessage,
      ).length;
      const finalResult = repair
        ? withRepairContext(result, {
            ...repair,
            retryCount: previousFailureCount + 1,
          })
        : result;

      session.toolResults.push({
        ...traceMetadata,
        ...(repair
          ? {
              errorHint: repair.errorHint,
              errorMessage: repair.errorMessage,
              retryCount: previousFailureCount + 1,
            }
          : {}),
        kind: policyResult.classification,
        result: finalResult,
        toolCallId: toolCall.id,
        toolName: effectiveToolName,
      });

      return finalResult;
    }

    if (policyResult.kind === 'write_draft') {
      session.writeDrafts.push(policyResult.draft);
      session.toolResults.push({
        ...traceMetadata,
        draft: policyResult.draft,
        kind: 'write_draft',
        toolCallId: toolCall.id,
        toolName: policyResult.draft.toolName,
      });

      return {
        content: [
          {
            text: JSON.stringify({
              approvalRequired: true,
              draft: policyResult.draft,
              message:
                'Write action captured as a Slack approval draft. Do not claim it has been applied.',
            }),
            type: 'text',
          },
        ],
      };
    }

    session.toolResults.push({
      ...traceMetadata,
      errorHint:
        'Use get_tool_catalog to discover allowed policy tools, then learn_tools before execute_tool.',
      errorMessage: policyResult.message,
      kind: 'denied',
      message: policyResult.message,
      toolCallId: toolCall.id,
      toolName: effectiveToolName,
    });

    return {
      content: [
        {
          text: JSON.stringify({
            error: policyResult.message,
            input: normalizeJsonRecord(normalizedToolArguments),
          }),
          type: 'text',
        },
      ],
      isError: true,
    };
  }

  private async submitApprovalDrafts(
    session: PolicyMcpSession,
    toolArguments: JsonRecord,
  ): Promise<McpToolCallResult> {
    const startedAt = this.now();
    const draftInputs = readDraftInputs(toolArguments);

    if (draftInputs.length === 0) {
      return {
        content: [
          {
            text: JSON.stringify({
              error:
                'submit_approval_draft requires a non-empty drafts array. Each draft needs toolName and arguments.',
            }),
            type: 'text',
          },
        ],
        isError: true,
      };
    }

    const capturedDrafts: WriteDraft[] = [];

    for (const draftInput of draftInputs) {
      if (classifyToolName(draftInput.toolName) !== 'write') {
        return {
          content: [
            {
              text: JSON.stringify({
                error: `submit_approval_draft only accepts CRM write tools. Received ${draftInput.toolName}.`,
              }),
              type: 'text',
            },
          ],
          isError: true,
        };
      }

      const policyResult = await this.policyGateway.executeToolCall({
        arguments: draftInput.arguments,
        id: randomUUID(),
        name: draftInput.toolName,
        reason: draftInput.reason,
      });

      if (policyResult.kind !== 'write_draft') {
        return {
          content: [
            {
              text: JSON.stringify({
                error: `Failed to create approval draft for ${draftInput.toolName}.`,
              }),
              type: 'text',
            },
          ],
          isError: true,
        };
      }

      capturedDrafts.push(policyResult.draft);
    }

    const finishedAt = this.now();

    for (const draft of capturedDrafts) {
      session.writeDrafts.push(draft);
      session.toolResults.push({
        draft,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        input: draft.arguments,
        kind: 'write_draft',
        policySessionId: session.id,
        promptProfile: session.profile,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        toolCallId: draft.id,
        toolName: draft.toolName,
      });
    }

    return {
      content: [
        {
          text: JSON.stringify({
            approvalRequired: true,
            drafts: capturedDrafts,
            message:
              'Write actions captured as one Slack approval draft. Do not claim they have been applied.',
            summary:
              typeof toolArguments.summary === 'string'
                ? toolArguments.summary
                : undefined,
          }),
          type: 'text',
        },
      ],
    };
  }
}

const POLICY_MCP_INSTRUCTIONS =
  'Slack-to-CRM policy MCP server. Follow this workflow: (1) get_tool_catalog to discover tools, (2) learn_tools to get input schemas, (3) execute_tool to run them. Never guess tool names. For comparative/grouped CRM analytics, use group_by tools. Use search_help_center for Twenty usage/help. Writes are never applied here: create/update/delete actions become Slack approval drafts.';

const objectSchema = {
  additionalProperties: true,
  type: 'object',
} as const;

const POLICY_MCP_TOOLS = [
  {
    description:
      'STEP 1: Browse available Twenty CRM tools by category. Call this before using learn_tools or execute_tool.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        categories: {
          description:
            'Optional category filters such as DATABASE_CRUD, ACTION, DASHBOARD, METADATA, VIEW, WORKFLOW.',
          items: { type: 'string' },
          type: 'array',
        },
      },
      type: 'object',
    },
    name: 'get_tool_catalog',
  },
  {
    description:
      'STEP 2: Learn exact input schemas and descriptions for tool names discovered by get_tool_catalog.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        aspects: {
          default: ['description', 'schema'],
          items: { enum: ['description', 'schema'], type: 'string' },
          type: 'array',
        },
        toolNames: {
          description: 'Exact tool names from get_tool_catalog.',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['toolNames'],
      type: 'object',
    },
    name: 'learn_tools',
  },
  {
    description:
      'Load detailed skills for complex tasks like dashboards, workflows, metadata, documents, or data manipulation.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        skillNames: {
          description:
            'Names of the skills to load, for example ["data-manipulation"].',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['skillNames'],
      type: 'object',
    },
    name: 'load_skills',
  },
  {
    description:
      'STEP 3: Execute a learned CRM tool by exact name with arguments matching the schema returned by learn_tools. Read tools run immediately; write tools create Slack approval drafts.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        arguments: objectSchema,
        toolName: {
          description: 'Exact tool name from get_tool_catalog.',
          type: 'string',
        },
      },
      required: ['toolName', 'arguments'],
      type: 'object',
    },
    name: 'execute_tool',
  },
  {
    description:
      'Submit one or more concrete CRM write actions as a Slack approval draft after validating targets with read tools. Use this for natural-language meeting updates that require several create/update/delete actions. This never applies CRM writes immediately.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        drafts: {
          description:
            'Concrete write actions to approve. Each item must use an exact CRM write tool name and schema-compatible arguments.',
          items: {
            additionalProperties: false,
            properties: {
              arguments: objectSchema,
              reason: {
                description: 'Short human-readable reason for this write.',
                type: 'string',
              },
              toolName: {
                description:
                  'Exact write tool name, for example update_opportunity or create_task.',
                type: 'string',
              },
            },
            required: ['toolName', 'arguments'],
            type: 'object',
          },
          type: 'array',
        },
        summary: {
          description: 'Short summary shown in the approval context.',
          type: 'string',
        },
      },
      required: ['drafts'],
      type: 'object',
    },
    name: 'submit_approval_draft',
  },
  {
    description:
      'Search the Twenty documentation and help center for setup, usage, and troubleshooting guidance.',
    inputSchema: {
      additionalProperties: true,
      properties: {
        query: {
          description: 'Help center search query.',
          type: 'string',
        },
      },
      required: ['query'],
      type: 'object',
    },
    name: 'search_help_center',
  },
] as const;

const readReason = (toolArguments: JsonRecord): string | undefined => {
  const reason = toolArguments.reason;

  return typeof reason === 'string' ? reason : undefined;
};

const readDraftInputs = (
  toolArguments: JsonRecord,
): Array<{
  arguments: JsonRecord;
  reason?: string;
  toolName: string;
}> => {
  const drafts = Array.isArray(toolArguments.drafts)
    ? toolArguments.drafts
    : [];

  return drafts.flatMap((draft) => {
    if (!isJsonRecord(draft) || typeof draft.toolName !== 'string') {
      return [];
    }

    return [
      {
        arguments: isJsonRecord(draft.arguments) ? draft.arguments : {},
        reason: typeof draft.reason === 'string' ? draft.reason : undefined,
        toolName: draft.toolName,
      },
    ];
  });
};

const withPolicyToolDefaults = (
  toolName: string,
  toolArguments: JsonRecord,
  profile: AgentPromptProfile,
): JsonRecord => {
  if (toolName !== 'get_tool_catalog') {
    return toolArguments;
  }

  const categories = toolArguments.categories;

  if (Array.isArray(categories) && categories.length > 0) {
    return toolArguments;
  }

  return {
    ...toolArguments,
    categories: getCatalogCategoriesForProfile(profile),
  };
};

const MAX_UNCOMPACTED_CATALOG_TOOLS = 120;
const MAX_COMPACTED_CATALOG_TOOLS = 80;

const shapeToolCatalogForRequest = (
  value: McpToolCallResult,
  requestText: string | undefined,
  profile: AgentPromptProfile,
): McpToolCallResult => {
  const payload = unwrapMcpTextJson(value);

  if (!isJsonRecord(payload) || !isJsonRecord(payload.catalog)) {
    return value;
  }

  const wantedTerms = buildRelevantToolTerms(requestText);
  const preferredCategories = new Set<string>(
    getCatalogCategoriesForProfile(profile),
  );
  const compactCatalog: JsonRecord = {};
  const fallbackEntries: Array<{ category: string; entry: JsonRecord }> = [];
  let originalCount = 0;
  let selectedCount = 0;

  for (const [category, entries] of Object.entries(payload.catalog)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    const selectedEntries = entries.flatMap((entry) => {
      originalCount += 1;

      if (!isJsonRecord(entry) || typeof entry.name !== 'string') {
        return [];
      }

      const description =
        typeof entry.description === 'string' ? entry.description : '';
      const searchableText = `${entry.name} ${description}`.toLowerCase();
      const categoryBoost = preferredCategories.has(category);

      if (!wantedTerms.some((term) => searchableText.includes(term))) {
        if (categoryBoost && fallbackEntries.length < MAX_COMPACTED_CATALOG_TOOLS) {
          fallbackEntries.push({
            category,
            entry: { description, name: entry.name },
          });
        }
        return [];
      }

      return [{ description, name: entry.name }];
    });

    if (selectedEntries.length > 0) {
      selectedCount += selectedEntries.length;
      compactCatalog[category] = selectedEntries;
    }
  }

  if (originalCount <= MAX_UNCOMPACTED_CATALOG_TOOLS) {
    return value;
  }

  for (const { category, entry } of fallbackEntries) {
    if (selectedCount >= MAX_COMPACTED_CATALOG_TOOLS) {
      break;
    }

    const entries = Array.isArray(compactCatalog[category])
      ? (compactCatalog[category] as JsonRecord[])
      : [];
    const alreadyIncluded = entries.some(
      (candidate) => candidate.name === entry.name,
    );

    if (alreadyIncluded) {
      continue;
    }

    entries.push(entry);
    compactCatalog[category] = entries;
    selectedCount += 1;
  }

  return {
    content: [
      {
        text: JSON.stringify({
          catalog: compactCatalog,
          message: `Compacted CRM tool catalog to ${selectedCount} likely relevant tool(s) from ${originalCount} for profile ${profile}. If needed, call get_tool_catalog again with broader or different categories. Use learn_tools before executing any listed CRM read/write tool.`,
        }),
        type: 'text',
      },
    ],
  };
};

type RepairContext = {
  errorHint: string;
  errorMessage: string;
};

const buildRepairContext = ({
  arguments: toolArguments,
  result,
  toolName,
}: {
  arguments: JsonRecord;
  result: McpToolCallResult;
  toolName: string;
}): RepairContext | null => {
  if (!isJsonRecord(result) || result.isError !== true) {
    return null;
  }

  const errorMessage = extractMcpErrorMessage(result);
  const hints = [
    `Tool ${toolName} returned an error. Inspect the learned schema and retry with corrected arguments when possible.`,
    buildSpecificRepairHint(toolName, toolArguments, errorMessage),
  ].filter((hint): hint is string => typeof hint === 'string');

  return {
    errorHint: hints.join(' '),
    errorMessage,
  };
};

const withRepairContext = (
  result: McpToolCallResult,
  repair: RepairContext & { retryCount: number },
): McpToolCallResult => {
  const payload = unwrapMcpTextJson(result);

  return {
    ...result,
    content: [
      {
        text: JSON.stringify({
          originalResult: payload,
          repair,
        }),
        type: 'text',
      },
    ],
    isError: true,
  };
};

const extractMcpErrorMessage = (result: McpToolCallResult): string => {
  if (typeof result.error === 'string') {
    return result.error;
  }

  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (!isJsonRecord(item) || typeof item.text !== 'string') {
        continue;
      }

      const parsedValue = parseJsonText(item.text);

      if (isJsonRecord(parsedValue)) {
        for (const key of ['error', 'message', 'errorMessage']) {
          const value = parsedValue[key];

          if (typeof value === 'string') {
            return value;
          }
        }
      }

      if (item.text.trim().length > 0) {
        return item.text.trim();
      }
    }
  }

  return 'MCP tool returned an error.';
};

const buildSpecificRepairHint = (
  toolName: string,
  toolArguments: JsonRecord,
  errorMessage: string,
): string | null => {
  const searchableText = `${toolName} ${errorMessage} ${JSON.stringify(
    toolArguments,
  )}`.toLowerCase();

  if (searchableText.includes('orderby') || searchableText.includes('sort')) {
    return 'For orderBy, use exact Twenty directions: AscNullsFirst, AscNullsLast, DescNullsFirst, DescNullsLast.';
  }

  if (toolName.startsWith('group_by_') || searchableText.includes('groupby')) {
    return 'For group_by tools, use schema-supported groupBy fields plus aggregateOperation and aggregateFieldName only when the learned schema allows them.';
  }

  if (
    searchableText.includes('date') ||
    searchableText.includes('time') ||
    searchableText.includes('operator')
  ) {
    return 'For date filters, use only operators returned by learn_tools, such as eq, gt, gte, lt, lte, in, is, or the exact schema-specific operator names.';
  }

  if (
    searchableText.includes('not found') ||
    searchableText.includes('unknown tool')
  ) {
    return 'Do not guess tool names. Call get_tool_catalog again, then learn_tools for exact tool names and schemas.';
  }

  if (searchableText.includes('undefined') && searchableText.includes('length')) {
    return 'A tool or skill returned an internal shape error. Continue with get_tool_catalog and learn_tools if possible, then use available CRM evidence instead of fabricating data.';
  }

  return null;
};

const unwrapMcpTextJson = (value: unknown): unknown => {
  if (!isJsonRecord(value) || !Array.isArray(value.content)) {
    return value;
  }

  for (const contentItem of value.content) {
    if (!isJsonRecord(contentItem) || typeof contentItem.text !== 'string') {
      continue;
    }

    const parsedValue = parseJsonText(contentItem.text);

    if (parsedValue !== null) {
      return parsedValue;
    }
  }

  return value;
};

const buildRelevantToolTerms = (requestText: string | undefined): string[] => {
  const normalizedText = requestText?.toLowerCase() ?? '';
  const terms = new Set<string>([
    'company',
    'companies',
    'opportunit',
    'person',
    'people',
    'task',
    'note',
  ]);

  const addTerms = (patterns: string[], toolTerms: string[]) => {
    if (patterns.some((pattern) => normalizedText.includes(pattern))) {
      toolTerms.forEach((term) => terms.add(term));
    }
  };

  addTerms(['회사', '기업', '고객사', 'account', 'vendor', '벤더'], [
    'company',
    'companies',
  ]);
  addTerms(['연락처', '담당자', '사람', 'contact'], ['person', 'people']);
  addTerms(['영업', '기회', '딜', 'deal', 'pipeline', '파이프라인'], [
    'opportunit',
  ]);
  addTerms(['할 일', '할일', '태스크', '업무', 'task'], ['task']);
  addTerms(['노트', '메모', '활동', 'activity', 'note'], ['note', 'activity']);

  return Array.from(terms);
};

const parseJsonText = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const readJsonRpcId = (value: unknown): JsonRpcId | undefined => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    value === null
  ) {
    return value;
  }

  return undefined;
};

const jsonRpcResult = (id: JsonRpcId, result: unknown): JsonRecord => ({
  id,
  jsonrpc: '2.0',
  result,
});

const jsonRpcError = (
  id: JsonRpcId,
  code: number,
  message: string,
): JsonRecord => ({
  error: {
    code,
    message,
  },
  id,
  jsonrpc: '2.0',
});

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
        reject(new Error('MCP request body is too large'));
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
        reject(new Error('MCP request body must be valid JSON'));
      }
    });

    request.on('error', reject);
  });

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const isAuthorizedMcpRequest = (
  headers: IncomingHttpHeaders,
  expectedToken: string,
): boolean => {
  const authorizationHeader = headers.authorization;

  if (!authorizationHeader?.startsWith('Bearer ')) {
    return false;
  }

  const actualToken = authorizationHeader.slice('Bearer '.length);

  return safeEqual(actualToken, expectedToken);
};

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};
