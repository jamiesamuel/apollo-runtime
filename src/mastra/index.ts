import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import { createAssistant } from './agents/assistant.js';
import { loadConfig } from './config.js';
import { createPostgresStorage } from './storage.js';
import { exampleWorkflow } from './workflows/example-workflow.js';
import { opportunityMonitorWorkflow } from './workflows/opportunity-monitor.js';

const config = loadConfig();
export const storage = createPostgresStorage(config.DATABASE_URL);
export const assistant = createAssistant(config, storage);

export const mastra = new Mastra({
  agents: { assistant },
  workflows: { exampleWorkflow, opportunityMonitorWorkflow },
  storage,
  server: {
    host: '0.0.0.0',
    port: config.PORT,
    cors: false,
    apiRoutes: [
      registerApiRoute('/health', {
        method: 'GET',
        requiresAuth: false,
        handler: async context => {
          try {
            await storage.db.one('SELECT 1 AS healthy');
            return context.json({ status: 'ok', database: 'ok' }, 200);
          } catch {
            return context.json({ status: 'error', database: 'unavailable' }, 503);
          }
        },
      }),
    ],
  },
});
