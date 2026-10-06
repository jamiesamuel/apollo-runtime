import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const brandResearchTool = createTool({
  id: 'brand-research',

  description:
    'Research a brand using current web information. Use this to understand corporate priorities, marketing priorities, advertising activity, product launches, growth initiatives and other commercially relevant developments.',

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

Identify the five most commercially relevant current findings across:

- corporate priorities
- marketing and advertising priorities
- major product launches
- growth categories
- target audiences
- geographic priorities
- partnerships or agency activity
- major challenges

Focus on recent, credible information.

Explain why each finding could matter to an advertising or media partner.

Cite the sources.
          `.trim(),

          tools: [
            {
              type: 'web_search',
            },
          ],
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