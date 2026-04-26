import type {
  SlackAgentApplyRequest,
  SlackAgentApplyResponse,
  SlackAgentProcessRequest,
  SlackAgentProcessResponse,
} from '../types';

export type AgentService = {
  apply: (request: SlackAgentApplyRequest) => Promise<SlackAgentApplyResponse>;
  process: (
    request: SlackAgentProcessRequest,
  ) => Promise<SlackAgentProcessResponse>;
  recordProcessFailure: (
    request: SlackAgentProcessRequest,
    errorMessage: string,
  ) => Promise<void>;
  recordApplyFailure: (
    request: SlackAgentApplyRequest,
    errorMessage: string,
  ) => Promise<void>;
};
