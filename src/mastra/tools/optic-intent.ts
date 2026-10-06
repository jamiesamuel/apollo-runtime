import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const opticIntentTool = createTool({
  id: 'optic-intent',

  description:
    'Search public web sources for evidence that a brand or its marketing leadership is focused on generative engine optimization, AI discovery, AI search, LLM visibility, answer engines or agentic shopping.',

  inputSchema: z.object({
    brand: z.string(),
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
Research whether ${brand}, its CMO, marketing leadership, digital leadership or ecommerce leadership has publicly discussed or acted on:

- Generative Engine Optimization / GEO
- AI search
- AI discovery
- brand visibility in LLMs
- answer engines
- ChatGPT / Gemini / Perplexity discovery
- agentic shopping
- changes in consumer discovery caused by generative AI

Prioritize:
1. Statements from the brand itself
2. Statements from the CMO or senior marketing leadership
3. Investor or corporate materials
4. Credible interviews and trade press

Focus especially on the last 12 months.

Return concise research with:

EVIDENCE FOUND:
Yes / No / Partial

EVIDENCE:
Up to 3 strongest examples with person/company, statement or action, source and date.

INTERPRETATION:
What this suggests about ${brand}'s potential readiness or need for an AI-discovery / GEO proposition.

Do not infer that ${brand} has a GEO strategy unless there is explicit evidence.
Do not invent statements.

If there is no credible evidence, clearly say so.

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
        `Optic intent research failed: ${response.status} ${await response.text()}`,
      );
    }

    const data: any = await response.json();

    const research = (data.output ?? [])
      .flatMap((item: any) => item.content ?? [])
      .filter(
        (content: any) =>
          content.type === 'output_text',
      )
      .map(
        (content: any) =>
          content.text,
      )
      .filter(Boolean)
      .join('\n')
      .trim();

    return {
      research:
        research ||
        'No credible public Optic intent evidence was found.',
    };
  },
});