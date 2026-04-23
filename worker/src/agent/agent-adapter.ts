import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentToolCall, JsonRecord, SlackAgentProcessRequest } from '../types';

export type AgentAdapterInput = {
  request: SlackAgentProcessRequest;
  systemPrompt: string;
};

export type AgentAdapterOutput = {
  assistantMessage: string;
  toolCalls: AgentToolCall[];
  metadata?: JsonRecord;
};

export type AgentAdapter = {
  run: (input: AgentAdapterInput) => Promise<AgentAdapterOutput>;
};

export class DeterministicAgentAdapter implements AgentAdapter {
  public async run(input: AgentAdapterInput): Promise<AgentAdapterOutput> {
    return {
      assistantMessage:
        input.request.toolCalls !== undefined && input.request.toolCalls.length > 0
          ? 'I prepared the requested CRM tool plan.'
          : 'I received the Slack request and did not need to call CRM tools.',
      metadata: {
        promptVersion: 'plan-skill-learn-execute-v1',
      },
      toolCalls: input.request.toolCalls ?? [],
    };
  }
}

export type CodexCliAgentAdapterOptions = {
  codexBinary?: string;
  codexHome?: string;
  model?: string;
  timeoutMs?: number;
  workingDirectory?: string;
};

export class CodexCliAgentAdapter implements AgentAdapter {
  private readonly codexBinary: string;
  private readonly codexHome?: string;
  private readonly model?: string;
  private readonly timeoutMs: number;
  private readonly workingDirectory: string;

  public constructor(options: CodexCliAgentAdapterOptions = {}) {
    this.codexBinary = options.codexBinary ?? 'codex';
    this.codexHome = options.codexHome;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.workingDirectory = options.workingDirectory ?? process.cwd();
  }

  public async run(input: AgentAdapterInput): Promise<AgentAdapterOutput> {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'slack-to-crm-codex-'));
    const lastMessagePath = join(tempDirectory, 'last-message.txt');
    const outputSchemaPath = join(tempDirectory, 'output-schema.json');

    try {
      await writeFile(
        outputSchemaPath,
        JSON.stringify(CODEX_OUTPUT_SCHEMA, null, 2),
      );
      await this.runCodexProcess({
        lastMessagePath,
        outputSchemaPath,
        prompt: buildCodexPrompt(input),
      });

      return normalizeCodexOutput(parseCodexOutput(await readFile(lastMessagePath, 'utf8')));
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  }

  private runCodexProcess({
    lastMessagePath,
    outputSchemaPath,
    prompt,
  }: {
    lastMessagePath: string;
    outputSchemaPath: string;
    prompt: string;
  }): Promise<void> {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--ignore-rules',
      '--ephemeral',
      '--color',
      'never',
      '--output-last-message',
      lastMessagePath,
      '--output-schema',
      outputSchemaPath,
      '--cd',
      this.workingDirectory,
      '-',
    ];

    if (this.model) {
      args.splice(1, 0, '--model', this.model);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this.codexBinary, args, {
        env: {
          ...process.env,
          ...(this.codexHome ? { CODEX_HOME: this.codexHome } : {}),
        },
        stdio: ['pipe', 'ignore', 'pipe'],
      });

      let stderr = '';
      let didTimeOut = false;
      const timeout = setTimeout(() => {
        didTimeOut = true;
        child.kill('SIGTERM');
      }, this.timeoutMs);

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (exitCode) => {
        clearTimeout(timeout);

        if (didTimeOut) {
          reject(new Error('Codex CLI timed out'));
          return;
        }

        if (exitCode !== 0) {
          reject(
            new Error(
              stderr.trim() ||
                `Codex CLI exited with status ${exitCode ?? 'unknown'}`,
            ),
          );
          return;
        }

        resolve();
      });

      child.stdin.end(prompt);
    });
  }
}

const buildCodexPrompt = (input: AgentAdapterInput): string =>
  [
    input.systemPrompt,
    'Use the MCP catalog and tool history in the request context. Return one JSON object only, with no markdown outside the JSON object and no surrounding commentary.',
    'The assistantMessage field may contain Slack mrkdwn with headings, tables, lists, and emoji when useful. Do not make report-style answers artificially short.',
    'If you need a schema before using a CRM tool, request learn_tools first. To run CRM tools, request execute_tool with { toolName, arguments }. If a write is needed, request execute_tool for that write tool so the worker can create an approval draft.',
    'JSON shape:',
    JSON.stringify(
      {
        assistantMessage: '<Slack-ready Korean answer or approval summary>',
        metadata: { mode: 'answer | write_draft | applied' },
        toolCalls: [
          {
            name: 'get_tool_catalog | learn_tools | load_skills | execute_tool',
            argumentsJson: '{"toolName":"find_companies","arguments":{"limit":5}}',
            reason: '<why this tool is needed>',
          },
        ],
      },
      null,
      2,
    ),
    'Request:',
    JSON.stringify(input.request, null, 2),
  ].join('\n\n');

const stripJsonCodeFence = (value: string): string =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const parseCodexOutput = (value: string): unknown => {
  const cleanedValue = stripJsonCodeFence(value);

  try {
    return JSON.parse(cleanedValue) as unknown;
  } catch {
    const startIndex = cleanedValue.indexOf('{');
    const endIndex = cleanedValue.lastIndexOf('}');

    if (startIndex >= 0 && endIndex > startIndex) {
      return JSON.parse(cleanedValue.slice(startIndex, endIndex + 1)) as unknown;
    }

    throw new Error('Codex output was not valid JSON');
  }
};

const isJsonRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeCodexOutput = (value: unknown): AgentAdapterOutput => {
  if (!isJsonRecord(value)) {
    throw new Error('Codex output must be a JSON object');
  }

  const toolCalls = Array.isArray(value.toolCalls)
    ? value.toolCalls.flatMap(normalizeToolCall)
    : [];

  return {
    assistantMessage:
      typeof value.assistantMessage === 'string'
        ? value.assistantMessage
        : 'CRM 요청을 처리했습니다.',
    metadata: isJsonRecord(value.metadata) ? value.metadata : undefined,
    toolCalls,
  };
};

const normalizeToolCall = (value: unknown): AgentToolCall[] => {
  if (!isJsonRecord(value) || typeof value.name !== 'string') {
    return [];
  }

  return [
    {
      arguments: normalizeToolArguments(value),
      id: typeof value.id === 'string' ? value.id : undefined,
      name: value.name,
      reason: typeof value.reason === 'string' ? value.reason : undefined,
    },
  ];
};

const normalizeToolArguments = (value: JsonRecord): JsonRecord => {
  if (isJsonRecord(value.arguments)) {
    return value.arguments;
  }

  if (typeof value.argumentsJson !== 'string') {
    return {};
  }

  try {
    const parsedArguments = JSON.parse(value.argumentsJson) as unknown;

    return isJsonRecord(parsedArguments) ? parsedArguments : {};
  } catch {
    return {};
  }
};

const CODEX_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assistantMessage', 'metadata', 'toolCalls'],
  properties: {
    assistantMessage: { type: 'string' },
    metadata: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: {
          type: 'string',
          enum: ['answer', 'write_draft', 'applied'],
        },
      },
      required: ['mode'],
    },
    toolCalls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'argumentsJson', 'reason'],
        properties: {
          name: { type: 'string' },
          argumentsJson: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;
