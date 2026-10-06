import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchKnowledge } from './knowledge.js';

export const futurePortfolioTool = createTool({
  id: 'future-portfolio',

  description:
    'Search Future-owned brand and portfolio knowledge, including audiences, editorial authority, categories and market strengths. Use this to identify which Future brands are relevant to an advertiser or commercial opportunity.',

  inputSchema: z.object({
    question: z
      .string()
      .describe(
        'What Future brands, audiences or areas of authority should be identified.',
      ),
  }),

  outputSchema: z.object({
    answer: z.string(),
  }),

  execute: async ({ question }) => ({
    answer: await searchKnowledge({
      question,
      knowledgeType: 'Brand',
    }),
  }),
});