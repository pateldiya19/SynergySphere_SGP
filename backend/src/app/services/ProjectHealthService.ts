type HealthTask = {
  _id?: unknown;
  id?: unknown;
  title: string;
  taskKey?: string;
  status: string;
  priority?: string;
  dueDate?: Date | string;
  assigneeId?: any;
  dependencies?: Array<{ status: string }>;
};

type HealthMember = { userId: any; role?: string };
type RiskSeverity = 'high' | 'critical';

export type ProjectHealthRisk = {
  key: string;
  severity: RiskSeverity;
  title: string;
  description: string;
  tasks: Array<{ id: string; title: string; taskKey?: string }>;
};

export type ProjectHealth = {
  status: 'Healthy' | 'At Risk' | 'Critical';
  assessedAt: string;
  metrics: {
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    blockedTasks: number;
    dependencyBlockedTasks: number;
    urgentDueSoonTasks: number;
    unassignedTasks: number;
    activeMembers: number;
    inactivityDays: number;
    lastActivityAt: string | null;
    workloadImbalance: { memberId: string; memberName: string; activeTasks: number } | null;
  };
  risks: ProjectHealthRisk[];
};

const idOf = (value: any): string => String(value?._id || value?.id || value || '');
const assigneeOf = (task: HealthTask): any => task.assigneeId;

function taskReferences(tasks: HealthTask[]) {
  return tasks.map(task => ({ id: idOf(task), title: task.title, taskKey: task.taskKey }));
}

export function calculateProjectHealth(
  input: {
    tasks: HealthTask[];
    members: HealthMember[];
    createdAt?: Date | string;
    updatedAt?: Date | string;
    lastHistoryAt?: Date | string | null;
    lastDiscussionAt?: Date | string | null;
  },
  now = new Date()
): ProjectHealth {
  const { tasks, members } = input;
  const openTasks = tasks.filter(task => task.status !== 'done');
  const overdueTasks = openTasks.filter(
    task => task.dueDate && new Date(task.dueDate).getTime() < now.getTime()
  );
  const blockedTasks = openTasks.filter(task => task.status === 'blocked');
  const dependencyBlockedTasks = openTasks.filter(task =>
    task.dependencies?.some(dependency => dependency.status !== 'done')
  );
  const urgentDueSoonTasks = openTasks.filter(task => {
    if (task.priority !== 'urgent' || !task.dueDate) return false;
    const dueTime = new Date(task.dueDate).getTime();
    return dueTime >= now.getTime() && dueTime <= now.getTime() + 7 * 24 * 60 * 60 * 1000;
  });
  const unassignedTasks = openTasks.filter(task => !idOf(assigneeOf(task)));

  const workload = new Map<string, { name: string; count: number; tasks: HealthTask[] }>();
  for (const task of openTasks) {
    const assignee = assigneeOf(task);
    const memberId = idOf(assignee);
    if (!memberId) continue;
    const member = members.find(item => idOf(item.userId) === memberId);
    const entry: { name: string; count: number; tasks: HealthTask[] } = workload.get(memberId) || {
      name: assignee?.name || member?.userId?.name || 'Project member',
      count: 0,
      tasks: [],
    };
    entry.count += 1;
    entry.tasks.push(task);
    workload.set(memberId, entry);
  }
  const rankedWorkload = [...workload.entries()].sort(
    (left, right) => right[1].count - left[1].count
  );
  const [topWorkload, nextWorkload] = rankedWorkload;
  const workloadImbalance =
    topWorkload &&
    topWorkload[1].count >= 3 &&
    topWorkload[1].count - (nextWorkload?.[1].count || 0) >= 2 &&
    topWorkload[1].count >= 2 * (nextWorkload?.[1].count || 1)
      ? {
          memberId: topWorkload[0],
          memberName: topWorkload[1].name,
          activeTasks: topWorkload[1].count,
        }
      : null;

  const activityCandidates = [
    input.createdAt,
    input.updatedAt,
    input.lastHistoryAt,
    input.lastDiscussionAt,
  ]
    .filter(Boolean)
    .map(value => new Date(value as Date | string))
    .concat(tasks.map(task => new Date((task as any).updatedAt || (task as any).createdAt || 0)))
    .filter(date => Number.isFinite(date.getTime()));
  const lastActivity = activityCandidates.length
    ? new Date(Math.max(...activityCandidates.map(date => date.getTime())))
    : null;
  const inactivityDays = lastActivity
    ? Math.max(0, Math.floor((now.getTime() - lastActivity.getTime()) / 86400000))
    : 0;

  const risks: ProjectHealthRisk[] = [];
  if (overdueTasks.length)
    risks.push({
      key: 'overdue',
      severity:
        overdueTasks.length >= 3 || overdueTasks.some(task => task.priority === 'urgent')
          ? 'critical'
          : 'high',
      title: 'Overdue tasks',
      description: `${overdueTasks.length} open task${overdueTasks.length === 1 ? ' is' : 's are'} past the due date.`,
      tasks: taskReferences(overdueTasks),
    });
  if (blockedTasks.length)
    risks.push({
      key: 'blocked',
      severity: blockedTasks.length >= 3 ? 'critical' : 'high',
      title: 'Blocked tasks',
      description: `${blockedTasks.length} open task${blockedTasks.length === 1 ? ' is' : 's are'} marked blocked.`,
      tasks: taskReferences(blockedTasks),
    });
  if (dependencyBlockedTasks.length)
    risks.push({
      key: 'dependencies',
      severity: dependencyBlockedTasks.length >= 3 ? 'critical' : 'high',
      title: 'Dependency blockers',
      description: `${dependencyBlockedTasks.length} task${dependencyBlockedTasks.length === 1 ? ' is' : 's are'} waiting on incomplete dependencies.`,
      tasks: taskReferences(dependencyBlockedTasks),
    });
  if (urgentDueSoonTasks.length)
    risks.push({
      key: 'urgent_due_soon',
      severity: 'high',
      title: 'Urgent deadlines approaching',
      description: `${urgentDueSoonTasks.length} urgent task${urgentDueSoonTasks.length === 1 ? ' is' : 's are'} due within 7 days.`,
      tasks: taskReferences(urgentDueSoonTasks),
    });
  if (unassignedTasks.length)
    risks.push({
      key: 'unassigned',
      severity: 'high',
      title: 'Unassigned work',
      description: `${unassignedTasks.length} open task${unassignedTasks.length === 1 ? ' has' : 's have'} no assignee.`,
      tasks: taskReferences(unassignedTasks),
    });
  if (workloadImbalance && topWorkload)
    risks.push({
      key: 'workload_imbalance',
      severity: 'high',
      title: 'Workload imbalance',
      description: `${workloadImbalance.memberName} has ${workloadImbalance.activeTasks} open tasks, at least twice the next-highest member's workload.`,
      tasks: taskReferences(topWorkload[1].tasks),
    });
  if (inactivityDays >= 14)
    risks.push({
      key: 'inactivity',
      severity: inactivityDays >= 30 ? 'critical' : 'high',
      title: 'Project inactivity',
      description: `No recorded project activity for ${inactivityDays} days.`,
      tasks: [],
    });

  const status = risks.some(risk => risk.severity === 'critical')
    ? 'Critical'
    : risks.length
      ? 'At Risk'
      : 'Healthy';
  return {
    status,
    assessedAt: now.toISOString(),
    metrics: {
      totalTasks: tasks.length,
      completedTasks: tasks.length - openTasks.length,
      overdueTasks: overdueTasks.length,
      blockedTasks: blockedTasks.length,
      dependencyBlockedTasks: dependencyBlockedTasks.length,
      urgentDueSoonTasks: urgentDueSoonTasks.length,
      unassignedTasks: unassignedTasks.length,
      activeMembers: workload.size,
      inactivityDays,
      lastActivityAt: lastActivity?.toISOString() || null,
      workloadImbalance,
    },
    risks,
  };
}
