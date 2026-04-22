type WorkerHandoffEndpoint = 'process' | 'apply';

type WorkerFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type WorkerHandoffRequestInput = {
  endpoint: WorkerHandoffEndpoint;
  slackAgentRequestId: string;
  slackAgentApprovalId?: string;
  approvedBySlackUserId?: string;
  workerPayload?: Record<string, unknown>;
  text?: string;
  responseUrl?: string;
  slackBotToken?: string;
  slack?: Record<string, string | undefined>;
  context?: Record<string, unknown>;
  workerBaseUrl?: string;
  workerSharedSecret?: string;
};

export type WorkerHandoffResult = {
  ok: boolean;
  status: number;
  errorMessage?: string;
};

export function buildWorkerHandoffRequest({
  endpoint,
  slackAgentRequestId,
  slackAgentApprovalId,
  approvedBySlackUserId,
  workerPayload,
  text,
  responseUrl,
  slackBotToken,
  slack,
  context,
  workerBaseUrl = process.env.WORKER_BASE_URL,
  workerSharedSecret = process.env.WORKER_SHARED_SECRET,
}: WorkerHandoffRequestInput): { url: string; init: RequestInit } {
  if (!workerBaseUrl) {
    throw new Error('WORKER_BASE_URL is not configured');
  }

  if (!workerSharedSecret) {
    throw new Error('WORKER_SHARED_SECRET is not configured');
  }

  const endpointPath =
    endpoint === 'process'
      ? 'internal/slack-agent/process'
      : 'internal/slack-agent/apply';
  const url = new URL(
    endpointPath,
    workerBaseUrl.endsWith('/') ? workerBaseUrl : `${workerBaseUrl}/`,
  );
  const body =
    endpoint === 'process'
      ? {
          slackAgentRequestId,
          ...(text ? { text } : {}),
          ...(responseUrl ? { responseUrl } : {}),
          ...(slackBotToken ? { slackBotToken } : {}),
          ...(slack ? { slack } : {}),
          ...(context ? { context } : {}),
        }
      : {
          slackAgentRequestId,
          slackAgentApprovalId,
          approvedBySlackUserId,
          ...(responseUrl ? { responseUrl } : {}),
          ...(workerPayload ?? {}),
        };

  return {
    url: url.toString(),
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${workerSharedSecret}`,
        'x-slack-agent-shared-secret': workerSharedSecret,
      },
      body: JSON.stringify(body),
    },
  };
}

export async function handoffSlackAgentRequestToWorker({
  fetchImplementation = fetch,
  ...input
}: WorkerHandoffRequestInput & {
  fetchImplementation?: WorkerFetch;
}): Promise<WorkerHandoffResult> {
  let request: { url: string; init: RequestInit };

  try {
    request = buildWorkerHandoffRequest(input);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  try {
    const response = await fetchImplementation(request.url, request.init);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        errorMessage: await response.text(),
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
