jest.mock('@/services/autopilot/AutopilotGraph', () => ({
  createAutopilotGraph: jest.fn(() => ({
    invoke: jest.fn().mockRejectedValue(new Error('provider timeout')),
  })),
}));

import { AutopilotAiService } from '@/services/AutopilotAiService';
import { AutopilotService } from '@/services/AutopilotService';
import { createAutopilotGraph } from '@/services/autopilot/AutopilotGraph';
import { config } from '@/config';

describe('Autopilot AI failure handling', () => {
  it('streams mocked OpenAI and Gemini output with project evidence', async () => {
    const previousProvider = config.AI_PROVIDER;
    const previousOpenAiKey = config.OPENAI_API_KEY;
    const previousGeminiKey = config.GEMINI_API_KEY;
    const model = {
      stream: jest.fn().mockImplementation(() =>
        (async function* () {
          yield { content: 'Use the actual task data.' };
          yield { content: [' Grounded response.'] };
        })()
      ),
    };
    const createModel = jest.spyOn(AutopilotAiService as any, 'createModel').mockReturnValue(model);
    const context = {
      health: { status: 'At Risk', risks: [{ key: 'overdue' }] },
      progress: 50,
      tasks: [{ _id: 'task-1', taskKey: 'TASK-1', title: 'Release', status: 'blocked' }],
      github: { connected: false, commits: 0, pullRequests: 0, mergedPullRequests: 0 },
    } as any;

    try {
      for (const provider of ['openai', 'gemini'] as const) {
        config.AI_PROVIDER = provider;
        config.OPENAI_API_KEY = 'mock-openai-key';
        config.GEMINI_API_KEY = 'mock-gemini-key';
        const tokens: string[] = [];
        const response = await AutopilotAiService.streamAnswer({
          context,
          question: 'What next?',
          onToken: token => tokens.push(token),
        });

        expect(response.status.provider).toBe(provider);
        expect(response.answer).toBe('Use the actual task data. Grounded response.');
        expect(tokens.join('')).toBe(response.answer);
        expect(response.evidence).toContainEqual({ label: 'Progress', value: '50% complete' });
      }
      expect(model.stream).toHaveBeenCalledTimes(2);
    } finally {
      config.AI_PROVIDER = previousProvider;
      config.OPENAI_API_KEY = previousOpenAiKey;
      config.GEMINI_API_KEY = previousGeminiKey;
      createModel.mockRestore();
    }
  });

  it('surfaces a sanitized streaming provider failure', async () => {
    const previousProvider = config.AI_PROVIDER;
    const previousKey = config.OPENAI_API_KEY;
    const createModel = jest.spyOn(AutopilotAiService as any, 'createModel').mockReturnValue({
      stream: jest.fn().mockRejectedValue(new Error('private provider response')),
    });
    try {
      config.AI_PROVIDER = 'openai';
      config.OPENAI_API_KEY = 'mock-openai-key';
      await expect(
        AutopilotAiService.streamAnswer({
          context: {
            health: { status: 'Healthy', risks: [] },
            progress: 100,
            tasks: [],
            github: { connected: false, commits: 0, pullRequests: 0, mergedPullRequests: 0 },
          } as any,
          question: 'Status?',
          onToken: jest.fn(),
        })
      ).rejects.toThrow('The configured AI provider could not complete this request.');
    } finally {
      config.AI_PROVIDER = previousProvider;
      config.OPENAI_API_KEY = previousKey;
      createModel.mockRestore();
    }
  });

  it('reports mocked provider failure without fabricating an AI result', async () => {
    const previousProvider = config.AI_PROVIDER;
    const previousKey = config.OPENAI_API_KEY;
    try {
      config.AI_PROVIDER = 'openai';
      config.OPENAI_API_KEY = 'mock-provider-key';
      const result = await AutopilotAiService.run({
        projectId: 'project-1',
        loadContext: jest.fn(),
        deterministicRecommendations: [],
      });

      expect(result.available).toBe(false);
      expect(result.status.configured).toBe(true);
      expect(result.result.summary).toBe('');
      expect(result.error).toContain('configured AI provider');
    } finally {
      config.AI_PROVIDER = previousProvider;
      config.OPENAI_API_KEY = previousKey;
    }
  });

  it('keeps deterministic analysis available when the selected provider key is missing', async () => {
    const previousProvider = config.AI_PROVIDER;
    const previousKey = config.OPENAI_API_KEY;
    const deterministicResult = {
      summary: 'Deterministic project summary.',
      reasoning: 'Health checks only.',
      recommendations: [],
      verifiedFacts: ['1 of 1 tasks are complete.'],
      estimates: [],
    };
    try {
      config.AI_PROVIDER = 'openai';
      config.OPENAI_API_KEY = 'FILL_ME';
      jest.mocked(createAutopilotGraph).mockReturnValue({
        invoke: jest.fn().mockResolvedValue({ result: deterministicResult }),
      } as any);

      const result = await AutopilotAiService.run({
        projectId: 'project-1',
        loadContext: jest.fn(),
        deterministicRecommendations: [],
      });

      expect(result.available).toBe(false);
      expect(result.status.configured).toBe(false);
      expect(result.result.summary).toBe(deterministicResult.summary);
      expect(result.error).toBeUndefined();
    } finally {
      config.AI_PROVIDER = previousProvider;
      config.OPENAI_API_KEY = previousKey;
    }
  });

  it('only treats owners and managers as approval actors', () => {
    const project = {
      ownerId: 'owner-1',
      members: [
        { userId: 'owner-1', role: 'owner' },
        { userId: 'manager-1', role: 'manager' },
        { userId: 'member-1', role: 'member' },
      ],
    };

    expect(AutopilotService.canApprove(project, 'owner-1')).toBe(true);
    expect(AutopilotService.canApprove(project, 'manager-1')).toBe(true);
    expect(AutopilotService.canApprove(project, 'member-1')).toBe(false);
  });
});
