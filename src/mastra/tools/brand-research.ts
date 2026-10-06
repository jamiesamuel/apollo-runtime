import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const brandContextSchema = z.object({
  purpose: z.string(),
  customerPersonas: z.array(z.string()),
  targetAudience: z.string(),
});

const recentSignalSchema = z.object({
  signal: z.string(),
  relevance: z.string(),
  source: z.string(),
});

export const brandResearchTool = createTool({
  id: 'brand-research',

  description:
    'Research an advertiser using current web information. Returns stable brand context, customer personas and target audience, plus commercially relevant signals from the last 90 days.',

  inputSchema: z.object({
    brand: z.string().describe('Brand or advertiser to research'),
  }),

  outputSchema: z.object({
    brandContext: brandContextSchema,
    recentSignals: z.array(recentSignalSchema),
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
Research ${brand} as a potential advertising client using current web sources.

Return TWO kinds of information.

BRAND CONTEXT

Establish:
- brand purpose or positioning
- up to 3 important customer personas
- concise description of the target audience

This does not need to be limited to the last 90 days.
Prefer primary brand/company sources where possible.

RECENT SIGNALS

Search the LAST 90 DAYS for up to 3 commercially relevant developments involving:
- corporate priorities
- marketing or advertising priorities
- product/category growth
- launches
- major business challenges

Only include meaningful developments.

If there are no credible recent developments, return an empty recentSignals array.

Return ONLY valid JSON:

{
  "brandContext": {
    "purpose": "concise description",
    "customerPersonas": [
      "persona",
      "persona",
      "persona"
    ],
    "targetAudience": "concise description"
  },
  "recentSignals": [
    {
      "signal": "max 25 words",
      "relevance": "why this could matter commercially, max 25 words",
      "source": "source and date"
    }
  ]
}

Do not invent information.
Do not use markdown.
          `.trim(),

          tools: [
            {
              type: 'web_search',
              search_context_size: 'low',
            },
          ],

          max_output_tokens: 800,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Brand research failed: ${response.status} ${await response.text()}`,
      );
    }

    const data: any = await response.json();

    const text = (data.output ?? [])
      .flatMap((item: any) => item.content ?? [])
      .filter((content: any) => content.type === 'output_text')
      .map((content: any) => content.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) {
      return {
        brandContext: {
          purpose: '',
          customerPersonas: [],
          targetAudience: '',
        },
        recentSignals: [],
      };
    }

    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      brandContext: brandContextSchema.parse(parsed.brandContext),
      recentSignals: z
        .array(recentSignalSchema)
        .parse(parsed.recentSignals ?? []),
    };
  },
});