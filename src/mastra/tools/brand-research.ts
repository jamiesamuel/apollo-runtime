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
    const runResearch = async () => {
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

Return:

1. BRAND CONTEXT
- purpose or positioning
- up to 3 customer personas
- target audience

2. RECENT SIGNALS
Find up to 3 meaningful developments from the LAST 90 DAYS covering:
- corporate priorities
- marketing or advertising
- launches or product growth
- material business challenges

If there are no credible recent developments, use an empty recentSignals array.

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
      "signal": "concise signal",
      "relevance": "commercial relevance",
      "source": "source and date"
    }
  ]
}

Do not use markdown.
Do not invent information.
            `.trim(),

            tools: [
              {
                type: 'web_search',
                search_context_size: 'low',
              },
            ],

            max_output_tokens: 1200,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Brand research failed: ${response.status} ${await response.text()}`,
        );
      }

      const data: any = await response.json();

      return (data.output ?? [])
        .flatMap((item: any) => item.content ?? [])
        .filter((content: any) => content.type === 'output_text')
        .map((content: any) => content.text)
        .filter(Boolean)
        .join('\n')
        .trim();
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await runResearch();

        if (!text) {
          continue;
        }

        const cleaned = text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const parsed = JSON.parse(cleaned);

        return {
          brandContext: brandContextSchema.parse(
            parsed.brandContext,
          ),

          recentSignals: z
            .array(recentSignalSchema)
            .parse(parsed.recentSignals ?? []),
        };
      } catch (error) {
        if (attempt === 2) {
          console.error(
            `Brand research failed for ${brand}:`,
            error,
          );
        }
      }
    }

    return {
      brandContext: {
        purpose: '',
        customerPersonas: [],
        targetAudience: '',
      },
      recentSignals: [],
    };
  },
});