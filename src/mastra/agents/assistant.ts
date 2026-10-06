import { createOpenAI } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import type { PostgresStore } from '@mastra/pg';
import type { AppConfig } from '../config.js';
import { helloTool } from '../tools/hello.js';
import { knowledgeTool } from '../tools/knowledge.js';

export function createAssistant(config: AppConfig, storage: PostgresStore): Agent {
  const litellm = createOpenAI({
    baseURL: process.env.LITELLM_BASE_URL,
    apiKey: process.env.LITELLM_API_KEY,
  });

  return new Agent({
    id: 'assistant',
    name: 'Assistant',
    description: 'A helpful starter assistant with persistent conversation history.',
    instructions: config.SYSTEM_PROMPT,
    model: litellm(config.MODEL_NAME),
    tools: {
      helloTool,
      knowledgeTool,
    },
    memory: new Memory({
      storage,
      options: {
        lastMessages: 20,
      },
    }),
  });
}