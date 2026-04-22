import type { JsonRecord } from '../types';

export type McpContent = {
  type: string;
  text?: string;
  data?: unknown;
  mimeType?: string;
} & JsonRecord;

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: JsonRecord;
} & JsonRecord;

export type McpInitializeResult = {
  protocolVersion?: string;
  capabilities?: JsonRecord;
  serverInfo?: {
    name?: string;
    version?: string;
  } & JsonRecord;
} & JsonRecord;

export type McpListToolsResult = {
  tools: McpTool[];
  nextCursor?: string;
} & JsonRecord;

export type McpToolCallResult = {
  content?: McpContent[];
  isError?: boolean;
} & JsonRecord;

export type TwentyMcpToolClient = {
  callTool: (
    name: string,
    toolArguments?: JsonRecord,
  ) => Promise<McpToolCallResult>;
};
