import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  workingDirectory?: string;
};

export class CodexCliAgentAdapter implements AgentAdapter {
  private readonly codexBinary: string;
  private readonly codexHome?: string;
  private readonly model?: string;
  private readonly workingDirectory: string;

  public constructor(options: CodexCliAgentAdapterOptions = {}) {
    this.codexBinary = options.codexBinary ?? 'codex';
    this.codexHome = options.codexHome;
    this.model = options.model;
    this.workingDirectory = options.workingDirectory ?? process.cwd();
  }

  public async run(input: AgentAdapterInput): Promise<AgentAdapterOutput> {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'slack-to-crm-codex-'));
    const lastMessagePath = join(tempDirectory, 'last-message.txt');

    try {
      await this.runCodexProcess({
        lastMessagePath,
        prompt: buildCodexPrompt(input),
      });

      return normalizeCodexOutput(
        JSON.parse(stripJsonCodeFence(await readFile(lastMessagePath, 'utf8'))) as unknown,
      );
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  }

  private runCodexProcess({
    lastMessagePath,
    prompt,
  }: {
    lastMessagePath: string;
    prompt: string;
  }): Promise<void> {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--full-auto',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--output-last-message',
      lastMessagePath,
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

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (exitCode) => {
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
    'Use the MCP catalog and skills in the request context. Return one JSON object only.',
    'JSON shape:',
    JSON.stringify(
      {
        assistantMessage: '<Slack-ready Korean answer or approval summary>',
        metadata: { mode: 'answer | write_draft | applied' },
        toolCalls: [
          {
            name: 'get_tool_catalog | learn_tools | load_skills | find_* | find_one_* | group_by_* | create_* | update_* | delete_*',
            arguments: {},
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
      arguments: isJsonRecord(value.arguments) ? value.arguments : {},
      id: typeof value.id === 'string' ? value.id : undefined,
      name: value.name,
      reason: typeof value.reason === 'string' ? value.reason : undefined,
    },
  ];
};
