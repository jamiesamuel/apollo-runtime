import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const knowledgeTool = createTool({
  id: 'knowledge',
  description:
    'Search Future commercial product knowledge for accurate information about products, pricing, positioning, processes, and go-to-market.',

  inputSchema: z.object({
    question: z.string().describe('The question to search Future knowledge for'),
  }),

  outputSchema: z.object({
    answer: z.string(),
  }),

  execute: async ({ question }) => {
    return {
      answer: `Knowledge search requested for: ${question}`,
    };
  },
});