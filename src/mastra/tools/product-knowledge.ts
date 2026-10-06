import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchKnowledge } from './knowledge.js';

export const productKnowledgeTool = createTool({
  id: 'product-knowledge',

 description:
  'Search and compare Future products, capabilities, positioning, pricing and ICPs. ALWAYS use this before making a commercial opportunity recommendation to determine which Future product or capability best enables the idea.',
  
  inputSchema: z.object({
    question: z
      .string()
      .describe('The product question to answer'),

    product: z
      .string()
      .optional()
      .describe(
        'Specific Future product when known, for example Optic or Aperture.',
      ),
  }),

  outputSchema: z.object({
    answer: z.string(),
  }),

  execute: async ({ question, product }) => ({
    answer: await searchKnowledge({
      question,
      knowledgeType: 'Product',
      knowledgeScope: product,
    }),
  }),
});