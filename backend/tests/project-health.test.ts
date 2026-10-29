import { calculateProjectHealth } from '../src/app/services/ProjectHealthService';

const now = new Date('2026-10-02T12:00:00.000Z');
const recent = new Date('2026-10-01T12:00:00.000Z');

function task(overrides: Record<string, unknown> = {}) {
  return {
    _id: `task-${Math.random()}`,
    title: 'Task',
    taskKey: 'TASK-1',
    status: 'todo',
    priority: 'medium',
    createdAt: recent,
    updatedAt: recent,
    ...overrides,
  };
}

describe('Project health rules', () => {
  it('reports Healthy when there are no supported risk signals', () => {
    const health = calculateProjectHealth(
      {
        createdAt: recent,
        updatedAt: recent,
        tasks: [
          task({ status: 'done' }),
          task({
            _id: 'active',
            assigneeId: { id: 'member-1', name: 'Ari' },
            dueDate: '2026-10-20',
          }),
        ],
        members: [{ userId: { id: 'member-1', name: 'Ari' } }],
      },
      now
    );

    expect(health.status).toBe('Healthy');
    expect(health.metrics).toMatchObject({
      totalTasks: 2,
      completedTasks: 1,
      overdueTasks: 0,
      unassignedTasks: 0,
    });
    expect(health.risks).toHaveLength(0);
  });

  it('reports task-specific risks and links them to task IDs', () => {
    const urgent = task({ _id: 'urgent-task', priority: 'urgent', dueDate: '2026-10-05' });
    const waiting = task({
      _id: 'waiting-task',
      dependencies: [{ status: 'in_progress' }],
      assigneeId: { id: 'member-1', name: 'Ari' },
    });
    const health = calculateProjectHealth(
      { createdAt: recent, updatedAt: recent, tasks: [urgent, waiting], members: [] },
      now
    );

    expect(health.status).toBe('At Risk');
    expect(health.metrics.urgentDueSoonTasks).toBe(1);
    expect(health.metrics.dependencyBlockedTasks).toBe(1);
    expect(health.metrics.unassignedTasks).toBe(1);
    expect(health.risks.find(risk => risk.key === 'urgent_due_soon')?.tasks[0].id).toBe(
      'urgent-task'
    );
    expect(health.risks.find(risk => risk.key === 'dependencies')?.tasks[0].id).toBe(
      'waiting-task'
    );
  });

  it('reports Critical for multiple overdue tasks and prolonged inactivity', () => {
    const health = calculateProjectHealth(
      {
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        tasks: [
          task({
            _id: 'overdue-1',
            dueDate: '2026-09-01',
            createdAt: '2026-08-01',
            updatedAt: '2026-08-01',
          }),
          task({
            _id: 'overdue-2',
            dueDate: '2026-09-02',
            createdAt: '2026-08-01',
            updatedAt: '2026-08-01',
          }),
          task({
            _id: 'overdue-3',
            dueDate: '2026-09-03',
            createdAt: '2026-08-01',
            updatedAt: '2026-08-01',
          }),
        ],
        members: [],
      },
      now
    );

    expect(health.status).toBe('Critical');
    expect(health.metrics.overdueTasks).toBe(3);
    expect(health.metrics.inactivityDays).toBeGreaterThanOrEqual(30);
    expect(health.risks.map(risk => risk.key)).toEqual(
      expect.arrayContaining(['overdue', 'inactivity'])
    );
  });

  it('flags workload imbalance only at the documented threshold', () => {
    const tasks = [
      task({ _id: 'a1', assigneeId: { id: 'a', name: 'Ari' } }),
      task({ _id: 'a2', assigneeId: { id: 'a', name: 'Ari' } }),
      task({ _id: 'a3', assigneeId: { id: 'a', name: 'Ari' } }),
      task({ _id: 'a4', assigneeId: { id: 'a', name: 'Ari' } }),
      task({ _id: 'b1', assigneeId: { id: 'b', name: 'Bo' } }),
    ];
    const health = calculateProjectHealth(
      { createdAt: recent, updatedAt: recent, tasks, members: [] },
      now
    );

    expect(health.metrics.workloadImbalance).toEqual({
      memberId: 'a',
      memberName: 'Ari',
      activeTasks: 4,
    });
    expect(health.risks.find(risk => risk.key === 'workload_imbalance')?.tasks).toHaveLength(4);
  });
});
