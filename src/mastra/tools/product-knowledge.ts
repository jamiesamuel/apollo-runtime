import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchKnowledge } from './knowledge.js';

export const productKnowledgeTool = createTool({
  id: 'product-knowledge',

  description:
    'Search Future product knowledge including capabilities, pricing, positioning, ICPs, use cases and sales guidance. Use this when evaluating which Future product fits a client need or when factual product information is required.',

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