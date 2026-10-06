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

/*
========================================================
OPENAI COMPATIBILITY HELPERS
========================================================
*/

function getMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (part: any) =>
          part?.type === 'text' &&
          typeof part?.text === 'string',
      )
      .map((part: any) => part.text)
      .join('\n');
  }

  return '';
}

function buildConversation(messages: any[]): string {
  return messages
    .filter(
      message =>
        message &&
        typeof message === 'object',
    )
    .map(message => {
      const role =
        typeof message.role === 'string'
          ? message.role
          : 'user';

      const content =
        getMessageText(message.content);

      return `${role.toUpperCase()}:\n${content}`;
    })
    .join('\n\n');
}

/*
========================================================
MASTRA
========================================================
*/

export const mastra = new Mastra({
  agents: {
    assistant,
  },

  workflows: {
    exampleWorkflow,
    opportunityMonitorWorkflow,
  },

  storage,

  server: {
    host: '0.0.0.0',
    port: config.PORT,
    cors: false,

    apiRoutes: [
      /*
      ----------------------------------------------------
      HEALTH
      ----------------------------------------------------
      */

      registerApiRoute('/health', {
        method: 'GET',
        requiresAuth: false,

        handler: async (context: any) => {
          try {
            await storage.db.one(
              'SELECT 1 AS healthy',
            );

            return context.json(
              {
                status: 'ok',
                database: 'ok',
              },
              200,
            );
          } catch {
            return context.json(
              {
                status: 'error',
                database: 'unavailable',
              },
              503,
            );
          }
        },
      }),

      /*
      ----------------------------------------------------
      OPENAI-COMPATIBLE MODEL LIST

      Open WebUI uses this to discover Apollo.
      ----------------------------------------------------
      */

      registerApiRoute('/v1/models', {
        method: 'GET',
        requiresAuth: false,

        handler: async (context: any) => {
          return context.json(
            {
              object: 'list',

              data: [
                {
                  id: 'apollo',
                  object: 'model',
                  created: 0,
                  owned_by: 'future',
                },
              ],
            },
            200,
          );
        },
      }),

      /*
      ----------------------------------------------------
      OPENAI-COMPATIBLE CHAT COMPLETIONS

      Open WebUI sends conversations here.
      ----------------------------------------------------
      */

      registerApiRoute('/v1/chat/completions', {
        method: 'POST',
        requiresAuth: false,

        handler: async (context: any) => {
          try {
            const body =
              await context.req.json();

            const messages =
              Array.isArray(body.messages)
                ? body.messages
                : [];

            if (messages.length === 0) {
              return context.json(
                {
                  error: {
                    message:
                      'messages is required',
                    type:
                      'invalid_request_error',
                  },
                },
                400,
              );
            }

            /*
            Open WebUI sends the conversation in
            OpenAI message format.

            For this first adapter we turn the
            conversation into text and hand it
            to the existing Apollo Mastra agent.
            */

            const conversation =
              buildConversation(messages);

            const result =
              await assistant.generate(
                conversation,
              );

            const text =
              result.text ?? '';

            const created =
              Math.floor(
                Date.now() / 1000,
              );

            return context.json(
              {
                id:
                  `chatcmpl-apollo-${created}`,

                object:
                  'chat.completion',

                created,

                model:
                  'apollo',

                choices: [
                  {
                    index: 0,

                    message: {
                      role:
                        'assistant',

                      content:
                        text,
                    },

                    finish_reason:
                      'stop',
                  },
                ],

                usage: {
                  prompt_tokens: 0,
                  completion_tokens: 0,
                  total_tokens: 0,
                },
              },
              200,
            );
          } catch (error) {
            console.error(
              'OpenAI compatibility route failed:',
              error,
            );

            return context.json(
              {
                error: {
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Apollo request failed',

                  type:
                    'server_error',
                },
              },
              500,
            );
          }
        },
      }),
    ],
  },
});