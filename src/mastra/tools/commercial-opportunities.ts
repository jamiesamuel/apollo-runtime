import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchKnowledge } from './knowledge.js';

export const commercialOpportunitiesTool = createTool({
  id: 'commercial-opportunities',

  description:
    'Search Future commercial packages, cultural moments, tentpoles and packaged opportunities. Use this to identify relevant upcoming sellable opportunities for an advertiser.',

  inputSchema: z.object({
    question: z
      .string()
      .describe(
        'What commercial opportunities or upcoming moments should be identified.',
      ),

    scope: z
      .string()
      .optional()
      .describe(
        'Specific commercial package knowledge source when known.',
      ),
  }),

  outputSchema: z.object({
    answer: z.string(),
  }),

  execute: async ({ question, scope }) => ({
    answer: await searchKnowledge({
      question,
      knowledgeType: 'Commercial Package',
      knowledgeScope: scope,
    }),
  }),
});