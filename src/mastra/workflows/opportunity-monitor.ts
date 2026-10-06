import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { brandResearchTool } from '../tools/brand-research.js';

const researchBrands = createStep({
  id: 'research-brands',

  inputSchema: z.object({
    brands: z.array(z.string()),
  }),

  outputSchema: z.object({
    research: z.array(
      z.object({
        brand: z.string(),
        research: z.string(),
      }),
    ),
  }),

  execute: async ({ inputData }) => {
    const research = [];

    for (const brand of inputData.brands) {
      const result = await brandResearchTool.execute!(
        { brand },
        {} as any,
      );

      research.push({
        brand,
        research: result.research,
      });
    }

    return { research };
  },
});

export const opportunityMonitorWorkflow = createWorkflow({
  id: 'opportunity-monitor',

  inputSchema: z.object({
    brands: z.array(z.string()),
  }),

  outputSchema: z.object({
    research: z.array(
      z.object({
        brand: z.string(),
        research: z.string(),
      }),
    ),
  }),
})
  .then(researchBrands)
  .commit();