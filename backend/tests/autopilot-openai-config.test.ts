jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(options => ({ options })),
}));

import { ChatOpenAI } from '@langchain/openai';
import { config } from '@/config';
import { AutopilotAiService } from '@/services/AutopilotAiService';

describe('Autopilot OpenAI-compatible client configuration', () => {
  const previousProvider = config.AI_PROVIDER;
  const previousKey = config.OPENAI_API_KEY;
  const previousModel = config.OPENAI_MODEL;
  const previousBaseUrl = config.OPENAI_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    config.AI_PROVIDER = 'openai';
    config.OPENAI_API_KEY = 'test-api-key';
    config.OPENAI_MODEL = 'openai/gpt-oss-20b';
  });

  afterAll(() => {
    config.AI_PROVIDER = previousProvider;
    config.OPENAI_API_KEY = previousKey;
    config.OPENAI_MODEL = previousModel;
    config.OPENAI_BASE_URL = previousBaseUrl;
  });

  it('passes the configured Groq-compatible base URL to ChatOpenAI', () => {
    config.OPENAI_BASE_URL = 'https://api.groq.com/openai/v1';

    (AutopilotAiService as any).createModel();

    expect(ChatOpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      model: 'openai/gpt-oss-20b',
      temperature: 0.1,
      maxRetries: 2,
      configuration: { baseURL: 'https://api.groq.com/openai/v1' },
    });
  });

  it('leaves the client base URL unset to preserve OpenAI defaults', () => {
    config.OPENAI_BASE_URL = '';
    config.OPENAI_MODEL = 'gpt-4o-mini';

    (AutopilotAiService as any).createModel();

    expect(ChatOpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxRetries: 2,
    });
  });
});
