import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const helloTool = createTool({
  id: 'hello',
  description: 'Returns a simple greeting for the supplied name.',

  inputSchema: z.object({
    name: z.string().describe('The name of the person to greet'),
  }),

  outputSchema: z.object({
    message: z.string(),
  }),

  execute: async ({ name }) => {
    return {
      message: `Hello ${name}`,
    };
  },
});