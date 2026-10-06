import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const brandResearchTool = createTool({
  id: 'brand-research',

  description:
    'Research current advertiser priorities using recent web sources. Use for external corporate, marketing, advertising, product and growth signals.',

  inputSchema: z.object({
    brand: z.string().describe('Brand or advertiser to research'),
  }),

  outputSchema: z.object({
    research: z.string(),
  }),

  execute: async ({ brand }) => {
    const response = await fetch(
      `${process.env.LITELLM_BASE_URL}/responses`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.LITELLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5.6-luna',

          input: `
Research ${brand} using current web sources.

Focus on the LAST 90 DAYS.

Return exactly 3 commercially relevant signals.

For each:
- SIGNAL: max 20 words
- RELEVANCE: max 20 words
- SOURCE: publisher/source and date

Prioritize:
- corporate strategy
- marketing or advertising priorities
- growth categories or products
- material business challenges

Prefer primary sources and recent reporting.
Do not provide background unless required to understand a signal.
Do not invent information.
Maximum 150 words total.
          `.trim(),

          tools: [
            {
              type: 'web_search',
              search_context_size: 'low',
            },
          ],

          tool_choice: 'auto',
          max_output_tokens: 500,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Brand research failed: ${response.status} ${await response.text()}`,
      );
    }

    const data: any = await response.json();

    const research = (data.output ?? [])
      .flatMap((item: any) => item.content ?? [])
      .filter((content: any) => content.type === 'output_text')
      .map((content: any) => content.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    return {
      research: research || 'No recent brand research was found.',
    };
  },
});