import {
  buildCoreParityPrompt,
  buildRuntimeContext,
} from './core-parity-prompt';

// Backwards-compatible export for existing native MCP runner imports.
// Production prompt construction now lives in core-parity-prompt.ts.
export const buildNativeMcpPrompt = buildCoreParityPrompt;
export { buildRuntimeContext };
