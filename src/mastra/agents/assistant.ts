import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import type { PostgresStore } from '@mastra/pg';
import type { AppConfig } from '../config.js';
import { helloTool } from '../tools/hello.js';
import { brandResearchTool } from '../tools/brand-research.js';
import { productKnowledgeTool } from '../tools/product-knowledge.js';
import { commercialOpportunitiesTool } from '../tools/commercial-opportunities.js';
import { futurePortfolioTool } from '../tools/future-portfolio.js';
import { assistantInstructions } from './instructions.js';

export function createAssistant(config: AppConfig, storage: PostgresStore): Agent {
  const litellm = createOpenAICompatible({
    name: 'litellm',
    baseURL: process.env.LITELLM_BASE_URL!,
    apiKey: process.env.LITELLM_API_KEY!,
  });

  return new Agent({
    id: 'assistant',
    name: 'Assistant',
    description: 'A helpful starter assistant with persistent conversation history.',
    instructions: assistantInstructions,
    model: litellm.chatModel(config.MODEL_NAME),
    tools: {
      helloTool,
      productKnowledgeTool,
      brandResearchTool,
      commercialOpportunitiesTool,
      futurePortfolioTool,
    },
    memory: new Memory({
      storage,
      options: {
        lastMessages: 20,
      },
    }),
  });
}