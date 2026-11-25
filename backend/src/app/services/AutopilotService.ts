import { AutopilotRecord, Project, Task, TaskComment, TaskHistory, Thread } from '@/models';
import { calculateProjectHealth, ProjectHealth } from './ProjectHealthService';
import { NotificationService } from './NotificationService';
import { TaskHistoryService } from './TaskHistoryService';
import { emitToProject } from '@/infrastructure/socket';
import { logger } from '@/utils';
import { AutopilotAiService } from './AutopilotAiService';
import type { AutopilotAiResult } from './autopilot/AutopilotGraph';

type ContextTask = any;

export type AutopilotContext = {
  project: any;
  tasks: ContextTask[];
  health: ProjectHealth;
  progress: number;
  activity: { events: number; discussions: number; lastActivityAt: string | null };
  comments: Array<{ taskId: string; body: string; authorName: string; createdAt: string }>;
  github: { connected: boolean; commits: number; pullRequests: number; mergedPullRequests: number };
};

const idOf = (value: any): string => String(value?._id || value?.id || value || '');
const memberName = (member: any): string => member?.userId?.name || 'Project member';

export class AutopilotService {
  static canApprove(project: any, actorId: string): boolean {
    const member = (project.members || []).find(
      (item: any) => String(item.userId) === String(actorId)
    );
    return (
      String(project.ownerId) === String(actorId) || ['owner', 'manager'].includes(member?.role)
    );
  }

  static async getContext(projectId: string): Promise<AutopilotContext> {
    const [project, tasks, lastHistory, lastDiscussion, activityCount, discussionCount, comments] =
      await Promise.all([
        Project.findById(projectId).populate('members.userId', 'name email avatarUrl').lean(),
        Task.find({ projectId })
          .populate('assigneeId', 'name email avatarUrl')
          .populate('dependencies', 'title taskKey status')
          .lean(),
        TaskHistory.findOne({ projectId }).sort({ createdAt: -1 }).select('createdAt').lean(),
        Thread.findOne({ projectId }).sort({ updatedAt: -1 }).select('updatedAt').lean(),
        TaskHistory.countDocuments({ projectId }),
        Thread.countDocuments({ projectId }),
        TaskComment.find({ projectId })
          .sort({ createdAt: -1 })
          .limit(30)
          .populate('authorId', 'name')
          .select('taskId body authorId createdAt')
          .lean(),
      ]);
    if (!project) throw new Error('Project not found');

    const health = calculateProjectHealth({
      tasks: tasks as any[],
      members: (project as any).members || [],
      createdAt: (project as any).createdAt,
      updatedAt: (project as any).updatedAt,
      lastHistoryAt: lastHistory?.createdAt,
      lastDiscussionAt: lastDiscussion?.updatedAt,
    });
    const completed = tasks.filter(task => task.status === 'done').length;
    const proofs = tasks.flatMap(task => task.proofOfWork || []);
    const pullRequests = proofs.filter((proof: any) => proof.pullRequestNumber).length;
    const mergedPullRequests = proofs.filter((proof: any) => proof.merged).length;
    const commits = proofs.reduce(
      (total: number, proof: any) =>
        total + Number(proof.commitCount || proof.commits?.length || 0),
      0
    );
    return {
      project,
      tasks,
      health,
      progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      activity: {
        events: activityCount,
        discussions: discussionCount,
        lastActivityAt: health.metrics.lastActivityAt,
      },
      comments: comments.map(comment => ({
        taskId: String(comment.taskId),
        body: comment.body,
        authorName: (comment.authorId as any)?.name || 'Project member',
        createdAt: new Date(comment.createdAt).toISOString(),
      })),
      github: {
        connected: Boolean((project as any).github?.owner && (project as any).github?.name),
        commits,
        pullRequests,
        mergedPullRequests,
      },
    };
  }

  private static recommendationCandidates(context: AutopilotContext) {
    const candidates: any[] = [];
    const { tasks, health, project } = context;
    const openTasks = tasks.filter(task => task.status !== 'done');
    const workloads = new Map<string, number>();
    for (const task of openTasks) {
      const assigneeId = idOf(task.assigneeId);
      if (assigneeId) workloads.set(assigneeId, (workloads.get(assigneeId) || 0) + 1);
    }
    const members = ((project as any).members || []).filter((member: any) => idOf(member.userId));
    const leastLoaded = [...members].sort(
      (left, right) =>
        (workloads.get(idOf(left.userId)) || 0) - (workloads.get(idOf(right.userId)) || 0)
    )[0];

    const overdue = openTasks.find(task => task.dueDate && new Date(task.dueDate) < new Date());
    if (overdue) {
      const dueDate = new Date(Date.now() + 3 * 86400000);
      candidates.push({
        fingerprint: `reschedule:${idOf(overdue)}`,
        title: `Recover ${overdue.taskKey || overdue.title}`,
        summary:
          'Move the overdue task to a near-term recovery date so the plan reflects an explicit commitment.',
        severity: 'high',
        evidence: [
          { label: 'Task', value: `${overdue.taskKey || 'Task'} · ${overdue.title}` },
          { label: 'Due date', value: new Date(overdue.dueDate).toLocaleDateString() },
        ],
        action: { type: 'reschedule_task', taskId: overdue._id, dueDate },
      });
    }
    const unassigned = openTasks.find(task => !idOf(task.assigneeId));
    if (unassigned && leastLoaded) {
      candidates.push({
        fingerprint: `assign:${idOf(unassigned)}:${idOf(leastLoaded.userId)}`,
        title: `Staff ${unassigned.taskKey || unassigned.title}`,
        summary: `Assign this unowned task to ${memberName(leastLoaded)} to remove a delivery blind spot.`,
        severity: 'high',
        evidence: [
          { label: 'Task', value: `${unassigned.taskKey || 'Task'} · ${unassigned.title}` },
          { label: 'Suggested owner', value: memberName(leastLoaded) },
          {
            label: 'Open workload',
            value: `${workloads.get(idOf(leastLoaded.userId)) || 0} tasks`,
          },
        ],
        action: { type: 'assign_task', taskId: unassigned._id, assigneeId: leastLoaded.userId },
      });
    }
    if (health.metrics.workloadImbalance && leastLoaded) {
      const overloadedTask = openTasks.find(
        task => idOf(task.assigneeId) === health.metrics.workloadImbalance?.memberId
      );
      if (overloadedTask && idOf(overloadedTask.assigneeId) !== idOf(leastLoaded.userId)) {
        candidates.push({
          fingerprint: `rebalance:${idOf(overloadedTask)}:${idOf(leastLoaded.userId)}`,
          title: `Rebalance ${overloadedTask.taskKey || overloadedTask.title}`,
          summary: `Move one open task from ${health.metrics.workloadImbalance.memberName} to ${memberName(leastLoaded)}.`,
          severity: 'medium',
          evidence: [
            { label: 'Current owner', value: health.metrics.workloadImbalance.memberName },
            {
              label: 'Current workload',
              value: `${health.metrics.workloadImbalance.activeTasks} open tasks`,
            },
            { label: 'Suggested owner', value: memberName(leastLoaded) },
          ],
          action: {
            type: 'assign_task',
            taskId: overloadedTask._id,
            assigneeId: leastLoaded.userId,
          },
        });
      }
    }
    const urgent = openTasks.find(task => task.priority !== 'urgent' && task.status === 'blocked');
    if (urgent) {
      candidates.push({
        fingerprint: `priority:${idOf(urgent)}`,
        title: `Elevate ${urgent.taskKey || urgent.title}`,
        summary:
          'Mark the blocked task urgent so it stays visible while its dependency or blocker is resolved.',
        severity: 'high',
        evidence: [
          { label: 'Status', value: 'Blocked' },
          { label: 'Dependencies', value: `${(urgent.dependencies || []).length} linked task(s)` },
        ],
        action: { type: 'update_priority', taskId: urgent._id, priority: 'urgent' },
      });
    }
    return candidates;
  }

  private static safeAiRecommendations(
    context: AutopilotContext,
    result: AutopilotAiResult
  ): any[] {
    const taskIds = new Set(context.tasks.map(task => idOf(task)));
    const memberIds = new Set(
      ((context.project as any).members || []).map((member: any) => idOf(member.userId))
    );
    return result.recommendations
      .filter(candidate => candidate && candidate.title && candidate.summary)
      .map(candidate => {
        const action = candidate.action;
        const safeAction =
          action &&
          taskIds.has(String(action.taskId)) &&
          (action.type !== 'assign_task' ||
            (action.assigneeId && memberIds.has(String(action.assigneeId)))) &&
          (action.type !== 'reschedule_task' ||
            (action.dueDate && Number.isFinite(new Date(String(action.dueDate)).getTime()))) &&
          (action.type !== 'update_priority' ||
            (action.priority && ['low', 'medium', 'high', 'urgent'].includes(action.priority)))
            ? {
                type: action.type,
                taskId: action.taskId,
                ...(action.assigneeId ? { assigneeId: action.assigneeId } : {}),
                ...(action.dueDate ? { dueDate: new Date(action.dueDate) } : {}),
                ...(action.priority ? { priority: action.priority } : {}),
              }
            : undefined;
        return {
          fingerprint: `ai:${String(candidate.title).toLowerCase()}:${String(
            action?.taskId || ''
          )}`,
          title: String(candidate.title).slice(0, 200),
          summary: String(candidate.summary).slice(0, 2000),
          severity: ['low', 'medium', 'high', 'critical'].includes(candidate.severity)
            ? candidate.severity
            : 'medium',
          reasoning: String(candidate.reasoning || result.reasoning).slice(0, 5000),
          evidence: Array.isArray(candidate.evidence)
            ? candidate.evidence
                .filter((item: any) => item?.label && item?.value)
                .map((item: any) => ({
                  label: String(item.label).slice(0, 100),
                  value: String(item.value).slice(0, 500),
                }))
            : [],
          action: safeAction,
          source: 'ai' as const,
          verifiedFacts: result.verifiedFacts,
          estimates: result.estimates,
        };
      });
  }

  static async analyzeProject(
    projectId: string,
    options: { notify?: boolean; actorId?: string; useAi?: boolean } = {}
  ): Promise<{
    context: AutopilotContext;
    risks: any[];
    recommendations: any[];
    newRiskKeys: string[];
    ai: {
      available: boolean;
      provider: 'openai' | 'gemini' | null;
      model: string | null;
      summary: string;
      reasoning: string;
      verifiedFacts: string[];
      estimates: string[];
      error?: string;
    };
  }> {
    const context = await this.getContext(projectId);
    const riskKeys = context.health.risks.map(
      risk => `${risk.key}:${risk.tasks.map(task => task.id).join(',')}`
    );
    const existingRisks = await AutopilotRecord.find({
      projectId,
      type: 'risk',
      status: { $in: ['observed', 'resolved'] },
    }).sort({ createdAt: -1 });
    await AutopilotRecord.updateMany(
      { projectId, type: 'risk', status: 'observed', fingerprint: { $nin: riskKeys } },
      { $set: { status: 'resolved' } }
    );
    const newRiskKeys: string[] = [];
    for (const risk of context.health.risks) {
      const fingerprint = `${risk.key}:${risk.tasks.map(task => task.id).join(',')}`;
      const active = existingRisks.find(
        record => record.fingerprint === fingerprint && record.status === 'observed'
      );
      if (!active) {
        await AutopilotRecord.create({
          projectId,
          type: 'risk',
          status: 'observed',
          fingerprint,
          title: risk.title,
          summary: risk.description,
          severity: risk.severity,
          evidence: risk.tasks.map(task => ({
            label: task.taskKey || 'Task',
            value: task.title,
          })),
        });
        newRiskKeys.push(fingerprint);
      }
    }
    const recommendationCandidates = this.recommendationCandidates(context);
    const recommendations: any[] = [];
    for (const candidate of recommendationCandidates) {
      const existing = await AutopilotRecord.findOne({
        projectId,
        type: 'recommendation',
        fingerprint: candidate.fingerprint,
        status: { $in: ['pending', 'approved', 'executed'] },
      });
      if (!existing) {
        recommendations.push(
          await AutopilotRecord.create({
            projectId,
            type: 'recommendation',
            status: 'pending',
            ...candidate,
          })
        );
      } else if (existing.status === 'pending') {
        recommendations.push(existing);
      }
    }
    let ai = {
      available: false,
      ...AutopilotAiService.status(),
      summary: '',
      reasoning: '',
      verifiedFacts: [] as string[],
      estimates: [] as string[],
    };
    if (options.useAi) {
      const aiRun = await AutopilotAiService.run({
        projectId,
        loadContext: currentProjectId => this.getContext(currentProjectId),
        deterministicRecommendations: recommendationCandidates,
      });
      ai = {
        available: aiRun.available,
        ...aiRun.status,
        summary: aiRun.result.summary,
        reasoning: aiRun.result.reasoning,
        verifiedFacts: aiRun.result.verifiedFacts,
        estimates: aiRun.result.estimates,
        ...(aiRun.error ? { error: aiRun.error } : {}),
      };
      for (const candidate of this.safeAiRecommendations(context, aiRun.result)) {
        const existing = await AutopilotRecord.findOne({
          projectId,
          type: 'recommendation',
          fingerprint: candidate.fingerprint,
          status: { $in: ['pending', 'approved', 'executed'] },
        });
        if (!existing) {
          recommendations.push(
            await AutopilotRecord.create({
              projectId,
              type: 'recommendation',
              status: candidate.action ? 'pending' : 'observed',
              ...candidate,
            })
          );
        } else if (existing.status === 'pending') {
          recommendations.push(existing);
        }
      }
    }
    if (options.notify && newRiskKeys.length > 0) {
      const recipients = [
        String((context.project as any).ownerId),
        ...((context.project as any).members || [])
          .filter((member: any) => ['owner', 'manager'].includes(member.role))
          .map((member: any) => idOf(member.userId)),
      ];
      await NotificationService.createMany(
        [...new Set(recipients)].map(userId => ({
          userId,
          type: 'autopilot_risk' as const,
          title: `${context.project.name}: new Autopilot risk`,
          message: `${newRiskKeys.length} new project risk${newRiskKeys.length === 1 ? '' : 's'} detected.`,
          payload: { projectId, riskKeys: newRiskKeys },
        }))
      );
    }
    return { context, risks: context.health.risks, recommendations, newRiskKeys, ai };
  }

  static async execute(recordId: string, actorId: string): Promise<any> {
    const record = await AutopilotRecord.findOne({ _id: recordId, type: 'recommendation' });
    if (!record || record.status !== 'pending')
      throw new Error('Recommendation is no longer pending');
    const task = await Task.findById(record.action?.taskId).populate(
      'projectId',
      'name ownerId members'
    );
    if (!task) throw new Error('Recommended task no longer exists');
    const project: any = task.projectId;
    if (String(record.projectId) !== String(project._id)) {
      throw new Error('Recommendation project does not match the target task');
    }
    if (!this.canApprove(project, actorId)) {
      throw new Error('Only project owners and managers can approve Autopilot actions');
    }
    const action: any = record.action;
    const update: any = {};
    if (action.type === 'assign_task') update.assigneeId = action.assigneeId;
    if (action.type === 'reschedule_task') update.dueDate = action.dueDate;
    if (action.type === 'update_priority') update.priority = action.priority;
    if (
      !Object.keys(update).length ||
      !['assign_task', 'reschedule_task', 'update_priority'].includes(action.type)
    ) {
      throw new Error('Unsupported or incomplete Autopilot action');
    }
    await Task.findByIdAndUpdate(task._id, update, { runValidators: true });
    await TaskHistoryService.record({
      taskId: String(task._id),
      projectId: String(project._id),
      actorId,
      type:
        action.type === 'assign_task'
          ? 'TASK_ASSIGNED'
          : action.type === 'reschedule_task'
            ? 'DEADLINE_CHANGED'
            : 'PRIORITY_CHANGED',
      source: 'system',
      description: `Autopilot action executed: ${action.type.replace(/_/g, ' ')}`,
      changes: update,
    });
    record.status = 'executed';
    record.actorId = actorId as any;
    record.result = `Updated ${task.title}`;
    await record.save();
    emitToProject(String(project._id), 'autopilot:updated', { projectId: String(project._id) });
    return record;
  }

  static async answer(
    projectId: string,
    question: string,
    actorId: string
  ): Promise<{
    answer: string;
    evidence: any[];
    ai: ReturnType<typeof AutopilotAiService.status> & { available: boolean; error?: string };
  }> {
    const context = await this.getContext(projectId);
    const aiRun = await AutopilotAiService.run({
      projectId,
      question,
      loadContext: currentProjectId => this.getContext(currentProjectId),
      deterministicRecommendations: [],
    });
    if (aiRun.available && aiRun.result.answer) {
      const evidence = [
        { label: 'Progress', value: `${context.progress}% complete` },
        { label: 'Health', value: context.health.status },
        { label: 'Open risks', value: String(context.health.risks.length) },
      ];
      await AutopilotRecord.create({
        projectId,
        type: 'chat',
        status: 'executed',
        source: 'ai',
        title: 'Assistant question',
        summary: question,
        question,
        answer: aiRun.result.answer,
        reasoning: aiRun.result.reasoning,
        evidence,
        verifiedFacts: aiRun.result.verifiedFacts,
        estimates: aiRun.result.estimates,
        actorId,
      });
      return {
        answer: aiRun.result.answer,
        evidence,
        ai: { available: true, ...aiRun.status },
      };
    }
    const normalized = question.toLowerCase();
    let answer = `Project health is ${context.health.status.toLowerCase()} with ${context.progress}% of ${context.tasks.length} tasks complete.`;
    if (normalized.includes('risk') || normalized.includes('block')) {
      answer =
        context.health.risks.length > 0
          ? `${context.health.risks.length} risk${context.health.risks.length === 1 ? '' : 's'} need attention: ${context.health.risks.map(risk => risk.title.toLowerCase()).join(', ')}.`
          : 'No active risks are detected from the current task, dependency, workload, and activity data.';
    } else if (normalized.includes('priorit') || normalized.includes('next')) {
      const next = context.tasks
        .filter(task => task.status !== 'done')
        .sort(
          (left, right) =>
            (right.priority === 'urgent' ? 1 : 0) - (left.priority === 'urgent' ? 1 : 0)
        )[0];
      answer = next
        ? `The next focus should be ${next.taskKey || next.title}, currently ${String(next.status).replace('_', ' ')} with ${next.priority} priority.`
        : 'There are no open tasks to prioritize.';
    } else if (
      normalized.includes('github') ||
      normalized.includes('commit') ||
      normalized.includes('pull request')
    ) {
      answer = context.github.connected
        ? `Linked GitHub evidence includes ${context.github.commits} commit${context.github.commits === 1 ? '' : 's'} across ${context.github.pullRequests} pull request${context.github.pullRequests === 1 ? '' : 's'}, with ${context.github.mergedPullRequests} merged.`
        : 'No linked GitHub repository is configured for this project.';
    }
    const evidence = [
      { label: 'Progress', value: `${context.progress}% complete` },
      { label: 'Health', value: context.health.status },
      { label: 'Open risks', value: String(context.health.risks.length) },
    ];
    await AutopilotRecord.create({
      projectId,
      type: 'chat',
      status: 'executed',
      source: 'deterministic',
      title: 'Assistant question',
      summary: question,
      question,
      answer,
      evidence,
      actorId,
    });
    return {
      answer,
      evidence,
      ai: {
        available: false,
        ...aiRun.status,
        ...(aiRun.error ? { error: aiRun.error } : {}),
      },
    };
  }

  static async streamAnswer(
    projectId: string,
    question: string,
    actorId: string,
    onToken: (token: string) => void
  ) {
    const context = await this.getContext(projectId);
    const streamed = await AutopilotAiService.streamAnswer({
      context,
      question,
      onToken,
    });
    const evidence = streamed.evidence;
    await AutopilotRecord.create({
      projectId,
      type: 'chat',
      status: 'executed',
      source: streamed.status.configured ? 'ai' : 'deterministic',
      title: 'Assistant question',
      summary: question,
      question,
      answer: streamed.answer,
      evidence,
      verifiedFacts: evidence.map(item => `${item.label}: ${item.value}`),
      estimates: streamed.status.configured ? [] : ['AI provider was not configured.'],
      actorId,
    });
    return { ...streamed, evidence };
  }

  static async monitorProjects(): Promise<void> {
    const projects = await Project.find({ isActive: true }).select('_id').lean();
    for (const project of projects) {
      try {
        await this.analyzeProject(String(project._id), { notify: true });
      } catch (error: any) {
        logger.error(`Autopilot monitoring failed for ${project._id}: ${error.message}`);
      }
    }
  }

  static async listRecords(projectId: string): Promise<any[]> {
    return AutopilotRecord.find({ projectId, type: { $in: ['risk', 'recommendation', 'chat'] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('action.assigneeId', 'name')
      .lean();
  }
}
