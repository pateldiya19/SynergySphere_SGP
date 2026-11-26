import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { config } from '@/config';
import { logger } from '@/utils';
import { AutopilotContext } from './AutopilotService';
import { AutopilotAiResult, createAutopilotGraph } from './autopilot/AutopilotGraph';

export type AutopilotAiStatus = {
  configured: boolean;
  provider: 'openai' | 'gemini' | null;
  model: string | null;
};

function hasProviderKey(value: string): boolean {
  const key = value.trim().toLowerCase();
  return Boolean(key) && !['fill_me', 'generate_me'].includes(key) && !key.startsWith('your-');
}

export class AutopilotAiService {
  static status(): AutopilotAiStatus {
    if (config.AI_PROVIDER === 'openai' && hasProviderKey(config.OPENAI_API_KEY)) {
      return { configured: true, provider: 'openai', model: config.OPENAI_MODEL };
    }
    if (config.AI_PROVIDER === 'gemini' && hasProviderKey(config.GEMINI_API_KEY)) {
      return { configured: true, provider: 'gemini', model: config.GEMINI_MODEL };
    }
    return { configured: false, provider: null, model: null };
  }

  private static createModel(): BaseChatModel | null {
    const status = this.status();
    if (!status.configured) return null;
    if (status.provider === 'openai') {
      return new ChatOpenAI({
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_MODEL,
        temperature: 0.1,
        maxRetries: 2,
        ...(config.OPENAI_BASE_URL ? { configuration: { baseURL: config.OPENAI_BASE_URL } } : {}),
      });
    }
    return new ChatGoogleGenerativeAI({
      apiKey: config.GEMINI_API_KEY,
      model: config.GEMINI_MODEL,
      temperature: 0.1,
      maxRetries: 2,
    });
  }

  static async run(input: {
    projectId: string;
    question?: string;
    loadContext: (projectId: string) => Promise<AutopilotContext>;
    deterministicRecommendations: unknown[];
  }): Promise<{
    available: boolean;
    status: AutopilotAiStatus;
    result: AutopilotAiResult;
    error?: string;
  }> {
    const status = this.status();
    try {
      const graph = createAutopilotGraph({
        loadContext: input.loadContext,
        model: this.createModel(),
        deterministicRecommendations: input.deterministicRecommendations,
      });
      const state = await graph.invoke({
        projectId: input.projectId,
        question: input.question || '',
      });
      return {
        available: status.configured,
        status,
        result: state.result!,
      };
    } catch (error: any) {
      logger.error(`Autopilot AI workflow failed: ${error.message}`);
      return {
        available: false,
        status,
        result: {
          summary: '',
          reasoning: '',
          recommendations: [],
          verifiedFacts: [],
          estimates: [],
        },
        error: status.configured
          ? 'The configured AI provider could not complete this request.'
          : 'Configure AI_PROVIDER and its provider key to enable AI reasoning.',
      };
    }
  }

  static async streamAnswer(input: {
    context: AutopilotContext;
    question: string;
    onToken: (token: string) => void;
  }): Promise<{
    answer: string;
    evidence: Array<{ label: string; value: string }>;
    status: AutopilotAiStatus;
  }> {
    const model = this.createModel();
    const status = this.status();
    if (!model) {
      const answer = `AI reasoning is not configured. Deterministic project health is ${input.context.health.status.toLowerCase()} with ${input.context.progress}% complete.`;
      input.onToken(answer);
      return {
        answer,
        evidence: [{ label: 'Health', value: input.context.health.status }],
        status,
      };
    }

    let answer = '';
    try {
      const stream = await model.stream([
        new SystemMessage(
          'Answer the project manager question using only the supplied SGP project data. ' +
            'Be concise, cite concrete task or metric facts, and clearly label estimates. ' +
            'Do not propose executing an action in this answer.'
        ),
        new HumanMessage(
          `Question: ${input.question}\nProject health: ${input.context.health.status}\n` +
            `Progress: ${input.context.progress}%\nRisks: ${JSON.stringify(input.context.health.risks)}\n` +
            `Tasks: ${JSON.stringify(
              input.context.tasks.map(task => ({
                id: task._id || task.id,
                key: task.taskKey,
                title: task.title,
                status: task.status,
                priority: task.priority,
                dueDate: task.dueDate,
              }))
            )}\nGitHub: ${JSON.stringify(input.context.github)}`
        ),
      ]);
      for await (const chunk of stream) {
        const token =
          typeof chunk.content === 'string'
            ? chunk.content
            : Array.isArray(chunk.content)
              ? chunk.content.map(item => (typeof item === 'string' ? item : '')).join('')
              : '';
        if (!token) continue;
        answer += token;
        input.onToken(token);
      }
    } catch (error: any) {
      logger.error(`Autopilot streaming provider failed: ${error.message}`);
      throw new Error('The configured AI provider could not complete this request.');
    }
    return {
      answer,
      evidence: [
        { label: 'Health', value: input.context.health.status },
        { label: 'Progress', value: `${input.context.progress}% complete` },
        { label: 'Open risks', value: String(input.context.health.risks.length) },
      ],
      status,
    };
  }
}
