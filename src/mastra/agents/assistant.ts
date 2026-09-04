import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import type { MastraStorage } from '@mastra/core/storage';
import type { AppConfig } from '../config.js';
import { getModelIdentifier } from '../config.js';

export function createAssistant(config: AppConfig, storage: MastraStorage): Agent {
  return new Agent({
    id: 'assistant',
    name: 'Assistant',
    description: 'A helpful starter assistant with persistent conversation history.',
    instructions: config.SYSTEM_PROMPT,
    model: getModelIdentifier(config),
    memory: new Memory({
      storage,
      options: {
        lastMessages: 20,
      },
    }),
  });
}
