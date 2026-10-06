import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const brandResearchTool = createTool({
  id: 'brand-research',

  description:
    'Research an advertiser using current web sources, including brand positioning, customers, target audience and recent commercially relevant developments.',

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

Give me two things:

BRAND CONTEXT
- What the brand stands for / its positioning
- Its 3 most important customer personas
- Its target audience

RECENT SIGNALS
- Up to 3 commercially relevant developments from the last 90 days
- Focus on marketing, advertising, growth, launches, strategy or material business challenges
- Include source and date

Use current web sources.
Prefer primary and credible sources.
If there are no strong recent signals, say so.

Be concise.
Maximum 250 words.
          `.trim(),

          tools: [
            {
              type: 'web_search',
              search_context_size: 'low',
            },
          ],

          max_output_tokens: 700,
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
      research:
        research ||
        'No usable brand research was returned.',
    };
  },
});