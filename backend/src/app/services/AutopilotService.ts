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

  private static verifiedAiFacts(context: AutopilotContext, facts: unknown): string[] {
    const knownFacts = [
      `${context.health.metrics.completedTasks} of ${context.health.metrics.totalTasks} tasks are complete.`,
      `${context.health.risks.length} active risk signals are present.`,
      `${context.github.commits} linked GitHub commits are recorded.`,
      `Project health is ${context.health.status}.`,
      `Project progress is ${context.progress}%.`,
    ];
    const normalized = (value: string) => value.trim().toLowerCase();
    return (Array.isArray(facts) ? facts : [])
      .filter(
        (fact): fact is string =>
          typeof fact === 'string' &&
          knownFacts.some(known => normalized(known) === normalized(fact))
      )
      .slice(0, 20);
  }

  private static safeAiRecommendations(
    context: AutopilotContext,
    result: AutopilotAiResult
  ): any[] {
    const taskIds = new Set(context.tasks.map(task => idOf(task)));
    const memberIds = new Set(
      ((context.project as any).members || []).map((member: any) => idOf(member.userId))
    );
    const knownEvidence = [
      { label: 'Health', value: context.health.status },
      { label: 'Progress', value: `${context.progress}% complete` },
      { label: 'Open risks', value: String(context.health.risks.length) },
      { label: 'GitHub commits', value: String(context.github.commits) },
      { label: 'Pull requests', value: String(context.github.pullRequests) },
      ...context.tasks.flatMap(task => {
        const key = String(task.taskKey || 'Task');
        const evidence = [
          { label: 'Task', value: `${key} · ${task.title}` },
          { label: 'Task', value: String(task.title) },
          { label: 'Status', value: String(task.status).replace(/_/g, ' ') },
          { label: 'Priority', value: String(task.priority) },
        ];
        if (task.dueDate && Number.isFinite(new Date(task.dueDate).getTime())) {
          evidence.push({
            label: 'Due date',
            value: new Date(task.dueDate).toISOString(),
          });
        }
        return evidence;
      }),
    ];
    const normalized = (value: string) => value.trim().toLowerCase();
    const recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];

    return recommendations
      .filter(
        candidate =>
          candidate &&
          typeof candidate.title === 'string' &&
          candidate.title.trim() &&
          typeof candidate.summary === 'string' &&
          candidate.summary.trim()
      )
      .map(candidate => {
        const evidence: Array<{ label: string; value: string }> = [];
        if (Array.isArray(candidate.evidence)) {
          for (const item of candidate.evidence) {
            if (!item || typeof item.label !== 'string' || typeof item.value !== 'string') continue;
            const verified = knownEvidence.find(
              known =>
                normalized(known.label) === normalized(item.label) &&
                normalized(known.value) === normalized(item.value)
            );
            if (
              verified &&
              !evidence.some(
                entry => entry.label === verified.label && entry.value === verified.value
              )
            ) {
              evidence.push(verified);
            }
          }
        }
        if (evidence.length === 0) return null;

        const action = candidate.action;
        const hasTask = typeof action?.taskId === 'string' && taskIds.has(action.taskId);
        const safeAction =
          hasTask &&
          action.type === 'assign_task' &&
          typeof action.assigneeId === 'string' &&
          memberIds.has(action.assigneeId)
            ? {
                type: action.type,
                taskId: action.taskId,
                assigneeId: action.assigneeId,
              }
            : hasTask &&
                action.type === 'reschedule_task' &&
                typeof action.dueDate === 'string' &&
                Number.isFinite(new Date(action.dueDate).getTime())
              ? {
                  type: action.type,
                  taskId: action.taskId,
                  dueDate: new Date(action.dueDate),
                }
              : hasTask &&
                  action.type === 'update_priority' &&
                  typeof action.priority === 'string' &&
                  ['low', 'medium', 'high', 'urgent'].includes(action.priority)
                ? {
                    type: action.type,
                    taskId: action.taskId,
                    priority: action.priority,
                  }
                : undefined;
        const estimates = (Array.isArray(result.estimates) ? result.estimates : [])
          .filter((estimate): estimate is string => typeof estimate === 'string')
          .map(estimate => estimate.slice(0, 500))
          .slice(0, 20);

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
          evidence,
          action: safeAction,
          source: 'ai' as const,
          verifiedFacts: this.verifiedAiFacts(context, result.verifiedFacts),
          estimates,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
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
      /** Whether a provider key is present, regardless of whether a run succeeded. */
      configured: boolean;
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
        verifiedFacts: this.verifiedAiFacts(context, aiRun.result.verifiedFacts),
        estimates: aiRun.result.estimates,
        ...(aiRun.error ? { error: aiRun.error } : {}),
      };
      if (aiRun.available) {
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
    if (!project) throw new Error('The task project no longer exists');
    if (String(record.projectId) !== String(project._id)) {
      throw new Error('Recommendation project does not match the target task');
    }
    if (!this.canApprove(project, actorId)) {
      throw new Error('Only project owners and managers can approve Autopilot actions');
    }
    const action: any = record.action;
    if (!action) throw new Error('Recommendation has no executable action');
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
    if (
      action.type === 'assign_task' &&
      !(project.members || []).some(
        (member: any) => idOf(member.userId) === String(action.assigneeId)
      )
    ) {
      throw new Error('The recommended assignee is no longer a project member');
    }

    const claimedRecord = await AutopilotRecord.findOneAndUpdate(
      { _id: record._id, type: 'recommendation', status: 'pending' },
      { $set: { status: 'approved', actorId } },
      { new: true }
    );
    if (!claimedRecord) throw new Error('Recommendation is no longer pending');

    try {
      const taskUpdate =
        action.type === 'reschedule_task'
          ? {
              $set: update,
              $unset: { dueReminderSentAt: 1, overdueReminderSentAt: 1 },
            }
          : update;
      const updatedTask = await Task.findByIdAndUpdate(task._id, taskUpdate, {
        new: true,
        runValidators: true,
      });
      if (!updatedTask) throw new Error('Recommended task no longer exists');
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
      claimedRecord.status = 'executed';
      claimedRecord.result = `Updated ${updatedTask.title}`;
      await claimedRecord.save();
    } catch (error) {
      await AutopilotRecord.findOneAndUpdate(
        { _id: claimedRecord._id, status: 'approved' },
        {
          $set: {
            status: 'failed',
            result: 'Execution failed. Review the task before creating another recommendation.',
          },
        }
      );
      throw error;
    }
    emitToProject(String(project._id), 'autopilot:updated', { projectId: String(project._id) });
    return claimedRecord;
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
        verifiedFacts: this.verifiedAiFacts(context, aiRun.result.verifiedFacts),
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

  /**
   * Background sweep: deterministic risk detection only.
   *
   * Deliberately never passes `useAi`. This runs on a timer for every active
   * project, so calling a provider here would burn quota continuously in the
   * background with nobody watching the result. AI analysis is user-initiated
   * through POST /api/autopilot/:id/analyze and nowhere else.
   */
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
