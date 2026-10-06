import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { brandResearchTool } from '../tools/brand-research.js';
import { futurePortfolioTool } from '../tools/future-portfolio.js';
import { commercialOpportunitiesTool } from '../tools/commercial-opportunities.js';
import { productKnowledgeTool } from '../tools/product-knowledge.js';

const researchItemSchema = z.object({
  brand: z.string(),
  research: z.string(),
});

const signalSchema = z.object({
  brand: z.string(),
  research: z.string(),
  signal: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']),
  reason: z.string(),
  investigate: z.boolean(),
});

const opportunitySchema = z.object({
  brand: z.string(),
  signal: z.enum(['HIGH', 'MEDIUM']),
  opportunity: z.string(),
  whyNow: z.string(),
  idea: z.string(),
  futureFit: z.string(),
  product: z.string(),
  nextStep: z.string(),
});

async function callModel<T>(
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(
    `${process.env.LITELLM_BASE_URL}/responses`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LITELLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.MODEL_NAME || 'gpt-5.6-luna',
        input: prompt,
        max_output_tokens: 600,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Model call failed: ${response.status} ${await response.text()}`,
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
    throw new Error('Model returned no output text.');
  }

  let parsed: unknown;

  try {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model returned invalid JSON: ${text}`);
  }

  return schema.parse(parsed);
}

async function executeTool<T>(
  tool: any,
  input: Record<string, unknown>,
): Promise<T> {
  const result = await tool.execute(input, {} as any);

  if (!result || typeof result !== 'object') {
    throw new Error(`Tool ${tool.id ?? 'unknown'} returned no result.`);
  }

  if ('error' in result) {
    throw new Error(
      `Tool ${tool.id ?? 'unknown'} failed: ${JSON.stringify(result)}`,
    );
  }

  return result as T;
}


/*
========================================================
STEP 1: RESEARCH WATCHLIST
========================================================
*/

const researchBrands = createStep({
  id: 'research-brands',

  inputSchema: z.object({
    brands: z.array(z.string()),
  }),

  outputSchema: z.object({
    research: z.array(researchItemSchema),
  }),

  execute: async ({ inputData }) => {
    const research: Array<z.infer<typeof researchItemSchema>> = [];

    for (const brand of inputData.brands) {
      const result = await executeTool<{ research: string }>(
        brandResearchTool,
        { brand },
      );

      research.push({
        brand,
        research: result.research,
      });
    }

    return { research };
  },
});


/*
========================================================
STEP 2: EVALUATE SIGNALS
========================================================
*/

const evaluateSignals = createStep({
  id: 'evaluate-signals',

  inputSchema: z.object({
    research: z.array(researchItemSchema),
  }),

  outputSchema: z.object({
    signals: z.array(signalSchema),
  }),

  execute: async ({ inputData }) => {
    const signals: Array<z.infer<typeof signalSchema>> = [];

    const evaluationSchema = z.object({
      signal: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      reason: z.string(),
    });

    for (const item of inputData.research) {
      if (
        !item.research ||
        item.research === 'No recent brand research was found.'
      ) {
        signals.push({
          brand: item.brand,
          research: item.research,
          signal: 'UNKNOWN',
          reason: 'Insufficient recent research.',
          investigate: false,
        });

        continue;
      }

      const evaluation = await callModel(
        `
Evaluate whether this recent advertiser research creates a meaningful media or advertising sales opportunity.

ADVERTISER
${item.brand}

RESEARCH
${item.research}

Classify the signal as:

HIGH = significant current development likely to create a new advertising, marketing, audience or partnership opportunity.

MEDIUM = commercially relevant development worth investigating against Future's capabilities.

LOW = routine business news with little evidence of a meaningful new advertising opportunity.

Be conservative.
Do not invent information.

Return ONLY valid JSON:
{
  "signal": "HIGH | MEDIUM | LOW",
  "reason": "one concise sentence"
}
        `.trim(),
        evaluationSchema,
      );

      signals.push({
        brand: item.brand,
        research: item.research,
        signal: evaluation.signal,
        reason: evaluation.reason,
        investigate:
          evaluation.signal === 'HIGH' ||
          evaluation.signal === 'MEDIUM',
      });
    }

    return { signals };
  },
});


/*
========================================================
STEP 3: BUILD OPPORTUNITIES
========================================================
*/

const buildOpportunities = createStep({
  id: 'build-opportunities',

  inputSchema: z.object({
    signals: z.array(signalSchema),
  }),

  outputSchema: z.object({
    opportunities: z.array(opportunitySchema),
    ignored: z.array(
      z.object({
        brand: z.string(),
        signal: z.enum(['LOW', 'UNKNOWN']),
        reason: z.string(),
      }),
    ),
  }),

  execute: async ({ inputData }) => {
    const opportunities: Array<z.infer<typeof opportunitySchema>> = [];

    const ignored: Array<{
      brand: string;
      signal: 'LOW' | 'UNKNOWN';
      reason: string;
    }> = [];

    const synthesisSchema = z.object({
      opportunity: z.string(),
      whyNow: z.string(),
      idea: z.string(),
      futureFit: z.string(),
      product: z.string(),
      nextStep: z.string(),
    });

    for (const signal of inputData.signals) {
      if (!signal.investigate) {
        ignored.push({
          brand: signal.brand,
          signal: signal.signal as 'LOW' | 'UNKNOWN',
          reason: signal.reason,
        });

        continue;
      }

      const portfolio = await executeTool<{ answer: string }>(
        futurePortfolioTool,
        {
          question: `
Given this advertiser signal for ${signal.brand}:

${signal.research}

Identify the 3 most relevant Future-owned brands, audiences or areas of editorial authority.

Return only relevant matches.
Be concise.
          `.trim(),
        },
      );

      const commercial = await executeTool<{ answer: string }>(
        commercialOpportunitiesTool,
        {
          question: `
Given this advertiser signal for ${signal.brand}:

${signal.research}

Identify up to 3 relevant upcoming Future commercial packages, cultural moments or tentpoles.

Prioritize opportunities that are timely and genuinely relevant.
If nothing strongly fits, say so.
Be concise.
          `.trim(),
        },
      );

      const products = await executeTool<{ answer: string }>(
        productKnowledgeTool,
        {
          question: `
Given this advertiser signal for ${signal.brand}:

${signal.research}

Future portfolio:
${portfolio.answer}

Commercial opportunities:
${commercial.answer}

Which Future product or capability best enables a strong commercial opportunity?

Compare relevant Future products and recommend the strongest fit.
Be concise.
          `.trim(),
        },
      );

      const synthesis = await callModel(
        `
You are Apollo, Future's commercial opportunity assistant.

Turn the evidence below into ONE strong, actionable commercial opportunity.

ADVERTISER
${signal.brand}

CURRENT SIGNAL
${signal.research}

SIGNAL STRENGTH
${signal.signal}

WHY IT WAS ESCALATED
${signal.reason}

FUTURE PORTFOLIO
${portfolio.answer}

COMMERCIAL PACKAGES / MOMENTS
${commercial.answer}

PRODUCT KNOWLEDGE
${products.answer}

RULES

- Start with the advertiser's current need.
- Do not simply summarize the evidence.
- Combine the strongest Future assets into one coherent pitch.
- Prefer one strong idea over several weak ideas.
- An existing commercial package is optional.
- A Future product or capability must support the recommendation.
- Do not invent existing Future products, packages, prices, audiences or advertiser priorities.
- If proposing something new, clearly treat it as a proposed commercial concept.

Return ONLY valid JSON:

{
  "opportunity": "short seller-friendly name",
  "whyNow": "maximum two concise sentences",
  "idea": "two or three concise sentences describing the pitch",
  "futureFit": "maximum three concise Future assets or capabilities",
  "product": "recommended Future product or capability and why",
  "nextStep": "one specific seller action"
}
        `.trim(),
        synthesisSchema,
      );

      opportunities.push({
        brand: signal.brand,
        signal: signal.signal as 'HIGH' | 'MEDIUM',
        ...synthesis,
      });
    }

    return {
      opportunities,
      ignored,
    };
  },
});


/*
========================================================
WORKFLOW
========================================================
*/

export const opportunityMonitorWorkflow = createWorkflow({
  id: 'opportunity-monitor',

  inputSchema: z.object({
    brands: z.array(z.string()),
  }),

  outputSchema: z.object({
    opportunities: z.array(opportunitySchema),
    ignored: z.array(
      z.object({
        brand: z.string(),
        signal: z.enum(['LOW', 'UNKNOWN']),
        reason: z.string(),
      }),
    ),
  }),
})
  .then(researchBrands)
  .then(evaluateSignals)
  .then(buildOpportunities)
  .commit();