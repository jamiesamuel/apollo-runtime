import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const brandResearchTool = createTool({
  id: 'brand-research',

  description:
    'Research a brand using recent web information to identify commercially relevant corporate, marketing, advertising, product and growth priorities.',

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
Research ${brand} as a potential advertising client.

Focus on developments from the LAST 90 DAYS.

Find the 3 most commercially relevant developments across:
- corporate priorities
- marketing and advertising priorities
- product or category growth
- major challenges

For each return:
1. Finding
2. Why it matters to a media partner
3. Source and date

Prioritize primary and credible sources.
Do not include developments older than 90 days unless essential context.

Be concise.
Maximum 300 words total.
          `.trim(),

          tools: [
            {
              type: 'web_search',
              search_context_size: 'low',
            },
          ],

          max_output_tokens: 600,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Brand research failed: ${response.status} ${await response.text()}`,
      );
    }

    const data: any = await response.json();

    const research = data.output
      ?.flatMap((item: any) => item.content ?? [])
      ?.find((content: any) => content.type === 'output_text')
      ?.text;

    return {
      research: research ?? 'No brand research was returned.',
    };
  },
});