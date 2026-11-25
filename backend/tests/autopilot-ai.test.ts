import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createAutopilotGraph } from '@/services/autopilot/AutopilotGraph';
import { AutopilotContext } from '@/services/AutopilotService';

const context = {
  project: {
    _id: 'project-1',
    name: 'Launch project',
    members: [{ userId: { _id: 'member-1', name: 'Ada' }, role: 'manager' }],
  },
  tasks: [
    {
      _id: 'task-1',
      taskKey: 'TASK-1',
      title: 'Ship release',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-11-20T00:00:00.000Z',
      assigneeId: { _id: 'member-1', name: 'Ada' },
      dependencies: [],
      proofOfWork: [],
    },
  ],
  health: {
    status: 'At Risk',
    metrics: {
      totalTasks: 1,
      completedTasks: 0,
      overdueTasks: 0,
      blockedTasks: 0,
      dependencyBlockedTasks: 0,
      urgentDueSoonTasks: 0,
      unassignedTasks: 0,
      activeMembers: 1,
      inactivityDays: 0,
      lastActivityAt: '2026-11-13T00:00:00.000Z',
      workloadImbalance: null,
    },
    risks: [
      {
        key: 'urgent_due_soon',
        severity: 'high',
        title: 'Urgent deadline approaching',
        description: 'The release is due soon.',
        tasks: [{ id: 'task-1', title: 'Ship release', taskKey: 'TASK-1' }],
      },
    ],
    assessedAt: '2026-11-13T00:00:00.000Z',
  },
  progress: 0,
  activity: { events: 3, discussions: 2, lastActivityAt: '2026-11-13T00:00:00.000Z' },
  github: { connected: true, commits: 4, pullRequests: 1, mergedPullRequests: 0 },
} as unknown as AutopilotContext;

describe('LangGraph Autopilot workflow', () => {
  it('retrieves context and parses a mocked provider recommendation', async () => {
    const model = {
      invoke: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          summary: 'The release needs attention.',
          reasoning: 'The due date is close and there is no completed work.',
          answer: 'Focus on Ship release next.',
          recommendations: [
            {
              title: 'Prioritize release validation',
              summary: 'Move validation ahead of lower-priority work.',
              severity: 'high',
              reasoning: 'The deadline is the nearest delivery constraint.',
              evidence: [{ label: 'Task', value: 'TASK-1 · Ship release' }],
              action: { type: 'update_priority', taskId: 'task-1', priority: 'urgent' },
            },
          ],
          verifiedFacts: ['0 of 1 tasks are complete.'],
          estimates: ['Validation may take one day.'],
        }),
      }),
    } as unknown as BaseChatModel;
    const loadContext = jest.fn().mockResolvedValue(context);
    const graph = createAutopilotGraph({
      loadContext,
      model,
      deterministicRecommendations: [],
    });

    const result = await graph.invoke({ projectId: 'project-1', question: 'What next?' });

    expect(loadContext).toHaveBeenCalledWith('project-1');
    expect(model.invoke).toHaveBeenCalledTimes(1);
    expect(result.context).toBe(context);
    expect(result.result?.recommendations[0].action?.taskId).toBe('task-1');
    expect(result.result?.estimates).toEqual(['Validation may take one day.']);
  });

  it('does not call an LLM when no model is configured', async () => {
    const loadContext = jest.fn().mockResolvedValue(context);
    const graph = createAutopilotGraph({
      loadContext,
      model: null,
      deterministicRecommendations: [
        {
          title: 'Use existing deterministic recommendation',
          summary: 'Keep the current approval workflow.',
          severity: 'medium',
          reasoning: 'Deterministic health rules identified the signal.',
          evidence: [],
        },
      ],
    });

    const result = await graph.invoke({ projectId: 'project-1' });

    expect(result.result?.recommendations).toHaveLength(1);
    expect(result.result?.reasoning).toContain('deterministic');
  });
});
