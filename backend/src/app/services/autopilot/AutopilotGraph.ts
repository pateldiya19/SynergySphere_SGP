import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { AutopilotContext } from '@/services/AutopilotService';

export type AutopilotAiRecommendation = {
  title: string;
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  evidence: Array<{ label: string; value: string }>;
  action?: {
    type: 'assign_task' | 'reschedule_task' | 'update_priority';
    taskId: string;
    assigneeId?: string;
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  };
};

export type AutopilotAiResult = {
  summary: string;
  reasoning: string;
  answer?: string;
  recommendations: AutopilotAiRecommendation[];
  verifiedFacts: string[];
  estimates: string[];
};

type GraphDependencies = {
  loadContext: (projectId: string) => Promise<AutopilotContext>;
  model: BaseChatModel | null;
  deterministicRecommendations: unknown[];
};

const GraphState = Annotation.Root({
  projectId: Annotation<string>(),
  question: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => '',
  }),
  context: Annotation<AutopilotContext | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  facts: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  result: Annotation<AutopilotAiResult | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

function snapshot(context: AutopilotContext): string {
  return JSON.stringify({
    project: {
      id: String(context.project._id || context.project.id),
      name: context.project.name,
      deadline: context.project.deadline || null,
    },
    progress: context.progress,
    health: context.health,
    activity: context.activity,
    comments: context.comments,
    github: context.github,
    members: (context.project.members || []).map((member: any) => ({
      id: String(member.userId?._id || member.userId?.id || member.userId),
      name: member.userId?.name || 'Project member',
      role: member.role,
    })),
    tasks: context.tasks.map(task => ({
      id: String(task._id || task.id),
      taskKey: task.taskKey,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate || null,
      assigneeId: task.assigneeId?._id || task.assigneeId?.id || task.assigneeId || null,
      assigneeName: task.assigneeId?.name || null,
      dependencies: (task.dependencies || []).map((dependency: any) => ({
        id: String(dependency._id || dependency.id || dependency),
        title: dependency.title,
        status: dependency.status,
      })),
      githubProof: (task.proofOfWork || []).map((proof: any) => ({
        pullRequestNumber: proof.pullRequestNumber,
        state: proof.state,
        merged: proof.merged,
        commitCount: proof.commitCount || proof.commits?.length || 0,
      })),
    })),
  });
}

function parseModelOutput(value: unknown): AutopilotAiResult {
  const content =
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.map(item => (typeof item === 'string' ? item : JSON.stringify(item))).join('')
        : JSON.stringify(value);
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary: String(parsed.summary || ''),
      reasoning: String(parsed.reasoning || ''),
      answer: parsed.answer ? String(parsed.answer) : undefined,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      verifiedFacts: Array.isArray(parsed.verifiedFacts) ? parsed.verifiedFacts.map(String) : [],
      estimates: Array.isArray(parsed.estimates) ? parsed.estimates.map(String) : [],
    };
  } catch {
    return {
      summary: cleaned,
      reasoning: 'The provider returned an unstructured response; no action was extracted.',
      recommendations: [],
      verifiedFacts: [],
      estimates: ['Provider output was not machine-readable JSON.'],
    };
  }
}

function deterministicResult(context: AutopilotContext, deterministicRecommendations: unknown[]) {
  return {
    summary: `Project is ${context.health.status.toLowerCase()} with ${context.progress}% of ${context.tasks.length} tasks complete.`,
    reasoning:
      'This result uses SGP deterministic health rules. No provider-backed reasoning was run.',
    recommendations: deterministicRecommendations as AutopilotAiRecommendation[],
    verifiedFacts: [
      `${context.health.metrics.completedTasks} of ${context.health.metrics.totalTasks} tasks are complete.`,
      `${context.health.risks.length} active risk signals are present.`,
      `${context.github.commits} linked GitHub commits are recorded.`,
    ],
    estimates: [],
  };
}

export function createAutopilotGraph(dependencies: GraphDependencies) {
  const graph = new StateGraph(GraphState)
    .addNode('retrieve_context', async (state: typeof GraphState.State) => ({
      context: await dependencies.loadContext(state.projectId),
    }))
    .addNode('collect_facts', async (state: typeof GraphState.State) => {
      if (!state.context) throw new Error('Project context was not retrieved');
      return {
        facts: [
          `Health: ${state.context.health.status}`,
          `Progress: ${state.context.progress}%`,
          `Active risks: ${state.context.health.risks.length}`,
          `Open tasks: ${state.context.tasks.filter(task => task.status !== 'done').length}`,
        ],
      };
    })
    .addNode('reason', async (state: typeof GraphState.State) => {
      if (!state.context) throw new Error('Project context was not retrieved');
      if (!dependencies.model) {
        return {
          result: deterministicResult(state.context, dependencies.deterministicRecommendations),
        };
      }

      const questionInstruction = state.question
        ? `Answer this user question using only the supplied project data: ${state.question}`
        : 'Create a concise project summary and contextual recovery recommendations.';
      const response = await dependencies.model.invoke([
        new SystemMessage(
          'You are SGP Autopilot, a cautious AI project manager. Use only supplied project data. ' +
            'Return valid JSON with keys summary, reasoning, answer, recommendations, verifiedFacts, estimates. ' +
            'Every recommendation needs title, summary, severity, reasoning, evidence. ' +
            'Only propose action types assign_task, reschedule_task, or update_priority, and only use IDs present in the data. ' +
            'Never claim an action was executed. Separate verified facts from estimates. ' +
            'If evidence is insufficient, say so.'
        ),
        new HumanMessage(`${questionInstruction}\n\nProject context:\n${snapshot(state.context)}`),
      ]);
      return { result: parseModelOutput(response.content) };
    })
    .addNode('finalize', async (state: typeof GraphState.State) => {
      if (!state.result) throw new Error('AI reasoning did not produce a result');
      return { result: state.result };
    })
    .addEdge(START, 'retrieve_context')
    .addEdge('retrieve_context', 'collect_facts')
    .addEdge('collect_facts', 'reason')
    .addEdge('reason', 'finalize')
    .addEdge('finalize', END);

  return graph.compile();
}
