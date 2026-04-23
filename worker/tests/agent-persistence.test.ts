import { describe, expect, it } from 'vitest';

import { AgentResultPersistence } from '../src/agent/agent-persistence';
import type { ToolPolicyGateway } from '../src/policy/tool-policy-gateway';
import type { JsonRecord, WriteDraft } from '../src/types';

const writeDraftOne: WriteDraft = {
  approvalPolicy: 'slack_user_approval_required',
  arguments: { id: 'opportunity-1', stage: 'NEGOTIATION' },
  createdAt: '2026-04-23T00:00:00.000Z',
  id: 'draft-1',
  status: 'pending_approval',
  toolName: 'update_opportunity',
};

const writeDraftTwo: WriteDraft = {
  approvalPolicy: 'slack_user_approval_required',
  arguments: { position: 'first', title: '미팅 노트' },
  createdAt: '2026-04-23T00:01:00.000Z',
  id: 'draft-2',
  status: 'pending_approval',
  toolName: 'create_note',
};

describe('AgentResultPersistence', () => {
  it('bundles multiple write drafts into one Slack approval record', async () => {
    const systemWriteCalls: Array<{ arguments: JsonRecord; name: string }> = [];
    const persistence = new AgentResultPersistence({
      policyGateway: {
        async callSystemWriteTool(name: string, toolArguments: JsonRecord = {}) {
          systemWriteCalls.push({ arguments: toolArguments, name });

          if (name === 'create_slack_agent_approval') {
            return { id: 'approval-1' };
          }

          return { id: `${name}-id` };
        },
      } as unknown as ToolPolicyGateway,
    });

    const metadata = await persistence.persistProcessResult({
      assistantMessage: 'CRM 반영 초안입니다.',
      request: { slackAgentRequestId: 'request-1' },
      toolResults: [],
      writeDrafts: [writeDraftOne, writeDraftTwo],
    });

    expect(metadata).toEqual({ approvalIds: ['approval-1'] });
    expect(
      systemWriteCalls.filter(
        (call) => call.name === 'create_slack_agent_approval',
      ),
    ).toHaveLength(1);
    expect(systemWriteCalls[0]).toMatchObject({
      arguments: {
        actions: { drafts: [writeDraftOne, writeDraftTwo] },
        title: 'Approval for 2 CRM changes',
        workerPayload: { drafts: [writeDraftOne, writeDraftTwo] },
      },
      name: 'create_slack_agent_approval',
    });
    expect(systemWriteCalls[1]).toMatchObject({
      arguments: {
        id: 'request-1',
        pendingApprovalId: 'approval-1',
        status: 'AWAITING_APPROVAL',
      },
      name: 'update_slack_agent_request',
    });
  });

  it('loads every draft from a bundled approval record', async () => {
    const persistence = new AgentResultPersistence({
      policyGateway: {
        async callReadTool() {
          return {
            content: [
              {
                text: JSON.stringify({
                  workerPayload: { drafts: [writeDraftOne, writeDraftTwo] },
                }),
                type: 'text',
              },
            ],
          };
        },
      } as unknown as ToolPolicyGateway,
    });

    await expect(persistence.loadDraftsFromApproval('approval-1')).resolves.toEqual(
      [writeDraftOne, writeDraftTwo],
    );
  });

  it('loads drafts from approval actions when workerPayload is missing', async () => {
    const persistence = new AgentResultPersistence({
      policyGateway: {
        async callReadTool() {
          return {
            content: [
              {
                text: JSON.stringify({
                  actions: { drafts: [writeDraftOne, writeDraftTwo] },
                  workerPayload: null,
                }),
                type: 'text',
              },
            ],
          };
        },
      } as unknown as ToolPolicyGateway,
    });

    await expect(persistence.loadDraftsFromApproval('approval-1')).resolves.toEqual(
      [writeDraftOne, writeDraftTwo],
    );
  });
});
