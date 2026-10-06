import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { brandResearchTool } from '../tools/brand-research.js';
import { futurePortfolioTool } from '../tools/future-portfolio.js';
import { commercialOpportunitiesTool } from '../tools/commercial-opportunities.js';
import { productKnowledgeTool } from '../tools/product-knowledge.js';


/*
========================================================
SCHEMAS
========================================================
*/

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

const researchItemSchema = z.object({
  brand: z.string(),
  brandContext: brandContextSchema,
  recentSignals: z.array(recentSignalSchema),
});

const signalSchema = z.object({
  brand: z.string(),
  brandContext: brandContextSchema,
  recentSignals: z.array(recentSignalSchema),
  signal: z.enum([
    'HIGH',
    'MEDIUM',
    'LOW',
    'NO_NEW_SIGNAL',
  ]),
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

const ignoredSchema = z.object({
  brand: z.string(),
  signal: z.enum(['LOW', 'NO_NEW_SIGNAL']),
  reason: z.string(),
});


/*
========================================================
HELPERS
========================================================
*/

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
        model:
          process.env.MODEL_NAME ||
          'gpt-5.6-luna',

        input: `
${prompt}

IMPORTANT:
Return ONLY valid JSON.
Do not use markdown fences.
Do not include commentary before or after the JSON.
        `.trim(),

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
    .filter(
      (content: any) =>
        content.type === 'output_text',
    )
    .map((content: any) => content.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!text) {
    throw new Error(
      'Model returned no output text.',
    );
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
    throw new Error(
      `Model returned invalid JSON: ${text}`,
    );
  }

  return schema.parse(parsed);
}


async function runTool<T>(
  tool: any,
  input: Record<string, unknown>,
): Promise<T> {
  const result = await tool.execute(
    input,
    {} as any,
  );

  if (
    !result ||
    typeof result !== 'object'
  ) {
    throw new Error(
      `Tool ${tool.id ?? 'unknown'} returned no result.`,
    );
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
STEP 1
RESEARCH WATCHLIST
========================================================
*/

const researchBrands = createStep({
  id: 'research-brands',

  inputSchema: z.object({
    brands: z.array(z.string()),
  }),

  outputSchema: z.object({
    research: z.array(
      researchItemSchema,
    ),
  }),

  execute: async ({ inputData }) => {
    const research: Array<
      z.infer<typeof researchItemSchema>
    > = [];

    for (
      const brand of inputData.brands
    ) {
      const result = await runTool<{
        brandContext: {
          purpose: string;
          customerPersonas: string[];
          targetAudience: string;
        };

        recentSignals: Array<{
          signal: string;
          relevance: string;
          source: string;
        }>;
      }>(
        brandResearchTool,
        { brand },
      );

      research.push({
        brand,
        brandContext:
          result.brandContext,
        recentSignals:
          result.recentSignals,
      });
    }

    return { research };
  },
});


/*
========================================================
STEP 2
EVALUATE SIGNALS
========================================================
*/

const evaluateSignals = createStep({
  id: 'evaluate-signals',

  inputSchema: z.object({
    research: z.array(
      researchItemSchema,
    ),
  }),

  outputSchema: z.object({
    signals: z.array(
      signalSchema,
    ),
  }),

  execute: async ({ inputData }) => {
    const signals: Array<
      z.infer<typeof signalSchema>
    > = [];

    const evaluationSchema =
      z.object({
        signal: z.enum([
          'HIGH',
          'MEDIUM',
          'LOW',
        ]),

        reason: z.string(),
      });

    for (
      const item of inputData.research
    ) {
      /*
      ----------------------------------------------------
      NO RECENT SIGNAL
      ----------------------------------------------------
      */

      if (
        item.recentSignals.length === 0
      ) {
        signals.push({
          brand: item.brand,

          brandContext:
            item.brandContext,

          recentSignals: [],

          signal:
            'NO_NEW_SIGNAL',

          reason:
            'No material recent commercial signal identified.',

          investigate: false,
        });

        continue;
      }


      /*
      ----------------------------------------------------
      EVALUATE SIGNAL
      ----------------------------------------------------
      */

      const evaluation =
        await callModel(
          `
Evaluate whether the recent developments below create a meaningful media or advertising sales opportunity.

ADVERTISER
${item.brand}

BRAND CONTEXT
${JSON.stringify(
  item.brandContext,
  null,
  2,
)}

RECENT SIGNALS
${JSON.stringify(
  item.recentSignals,
  null,
  2,
)}

CLASSIFICATION

HIGH

A significant current development likely to create a new advertising, marketing, audience or partnership opportunity.

MEDIUM

A commercially relevant development worth investigating against Future's capabilities.

LOW

Routine business news with little evidence of a meaningful new advertising opportunity.

Consider both:
- what has recently changed
- who the brand is trying to reach

Be conservative.

Do not invent information.

Return:

{
  "signal": "HIGH or MEDIUM or LOW",
  "reason": "one concise sentence"
}
          `.trim(),

          evaluationSchema,
        );


      signals.push({
        brand: item.brand,

        brandContext:
          item.brandContext,

        recentSignals:
          item.recentSignals,

        signal:
          evaluation.signal,

        reason:
          evaluation.reason,

        investigate:
          evaluation.signal ===
            'HIGH' ||
          evaluation.signal ===
            'MEDIUM',
      });
    }

    return { signals };
  },
});


/*
========================================================
STEP 3
BUILD OPPORTUNITIES
========================================================
*/

const buildOpportunities =
  createStep({
    id: 'build-opportunities',

    inputSchema: z.object({
      signals: z.array(
        signalSchema,
      ),
    }),

    outputSchema: z.object({
      opportunities: z.array(
        opportunitySchema,
      ),

      ignored: z.array(
        ignoredSchema,
      ),
    }),

    execute: async ({
      inputData,
    }) => {
      const opportunities: Array<
        z.infer<
          typeof opportunitySchema
        >
      > = [];

      const ignored: Array<
        z.infer<typeof ignoredSchema>
      > = [];

      const synthesisSchema =
        z.object({
          opportunity:
            z.string(),

          whyNow:
            z.string(),

          idea:
            z.string(),

          futureFit:
            z.string(),

          product:
            z.string(),

          nextStep:
            z.string(),
        });


      for (
        const signal of inputData.signals
      ) {
        /*
        ----------------------------------------------------
        IGNORE LOW / NO NEW SIGNAL
        ----------------------------------------------------
        */

        if (!signal.investigate) {
          ignored.push({
            brand:
              signal.brand,

            signal:
              signal.signal as
                | 'LOW'
                | 'NO_NEW_SIGNAL',

            reason:
              signal.reason,
          });

          continue;
        }


        /*
        ----------------------------------------------------
        FUTURE PORTFOLIO
        ----------------------------------------------------
        */

        const portfolio =
          await runTool<{
            answer: string;
          }>(
            futurePortfolioTool,
            {
              question: `
Advertiser:
${signal.brand}

Brand purpose:
${signal.brandContext.purpose}

Target audience:
${signal.brandContext.targetAudience}

Customer personas:
${signal.brandContext.customerPersonas.join(
  ', ',
)}

Recent commercial signals:
${JSON.stringify(
  signal.recentSignals,
  null,
  2,
)}

Identify the 3 most relevant Future-owned brands, audiences or areas of editorial authority.

Prioritize genuine audience and category fit.

Only return relevant matches.

Be concise.
              `.trim(),
            },
          );


        /*
        ----------------------------------------------------
        COMMERCIAL OPPORTUNITIES
        ----------------------------------------------------
        */

        const commercial =
          await runTool<{
            answer: string;
          }>(
            commercialOpportunitiesTool,
            {
              question: `
Advertiser:
${signal.brand}

Brand purpose:
${signal.brandContext.purpose}

Target audience:
${signal.brandContext.targetAudience}

Customer personas:
${signal.brandContext.customerPersonas.join(
  ', ',
)}

Recent commercial signals:
${JSON.stringify(
  signal.recentSignals,
  null,
  2,
)}

Identify up to 3 relevant upcoming Future commercial packages, cultural moments or tentpoles.

Prioritize:
- relevance to the current advertiser signal
- audience fit
- timing
- genuine commercial fit

If nothing strongly fits, say so.

Be concise.
              `.trim(),
            },
          );


        /*
        ----------------------------------------------------
        PRODUCT KNOWLEDGE
        ----------------------------------------------------
        */

        const products =
          await runTool<{
            answer: string;
          }>(
            productKnowledgeTool,
            {
              question: `
Advertiser:
${signal.brand}

Brand purpose:
${signal.brandContext.purpose}

Target audience:
${signal.brandContext.targetAudience}

Customer personas:
${signal.brandContext.customerPersonas.join(
  ', ',
)}

Recent signals:
${JSON.stringify(
  signal.recentSignals,
  null,
  2,
)}

Future portfolio context:
${portfolio.answer}

Commercial opportunity context:
${commercial.answer}

Determine which Future product or capability best enables a strong commercial opportunity.

Compare relevant Future products.

Recommend the strongest fit.

Do not force a product if the evidence does not support its capabilities.

Be concise.
              `.trim(),
            },
          );


        /*
        ----------------------------------------------------
        SYNTHESIS
        ----------------------------------------------------
        */

        const synthesis =
          await callModel(
            `
You are Apollo, Future's commercial opportunity assistant.

Turn the evidence below into ONE strong, actionable commercial opportunity.

ADVERTISER
${signal.brand}

BRAND PURPOSE
${signal.brandContext.purpose}

TARGET AUDIENCE
${signal.brandContext.targetAudience}

CUSTOMER PERSONAS
${signal.brandContext.customerPersonas.join(
  ', ',
)}

RECENT SIGNALS
${JSON.stringify(
  signal.recentSignals,
  null,
  2,
)}

SIGNAL STRENGTH
${signal.signal}

WHY ESCALATED
${signal.reason}

FUTURE PORTFOLIO
${portfolio.answer}

COMMERCIAL PACKAGES / MOMENTS
${commercial.answer}

PRODUCT KNOWLEDGE
${products.answer}

RULES

Start with the advertiser's current need.

Use brand purpose, audience and personas to improve the commercial fit.

Do not simply summarize the evidence.

Combine the strongest Future assets into ONE coherent pitch.

Prefer one strong idea over several weak ideas.

An existing commercial package is optional.

A Future product or capability must support the recommendation.

Do not invent:
- Future products
- Future packages
- prices
- audiences
- advertiser priorities

If proposing a new commercial concept, clearly treat it as a proposal rather than an existing Future package.

Return:

{
  "opportunity": "short seller-friendly opportunity name",
  "whyNow": "maximum two concise sentences",
  "idea": "two or three concise sentences explaining what we should pitch",
  "futureFit": "maximum three relevant Future brands, moments or capabilities",
  "product": "recommended Future product or capability and why",
  "nextStep": "one specific seller action"
}
            `.trim(),

            synthesisSchema,
          );


        opportunities.push({
          brand:
            signal.brand,

          signal:
            signal.signal as
              | 'HIGH'
              | 'MEDIUM',

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

export const opportunityMonitorWorkflow =
  createWorkflow({
    id: 'opportunity-monitor',

    inputSchema: z.object({
      brands: z.array(
        z.string(),
      ),
    }),

    outputSchema: z.object({
      opportunities: z.array(
        opportunitySchema,
      ),

      ignored: z.array(
        ignoredSchema,
      ),
    }),
  })
    .then(researchBrands)
    .then(evaluateSignals)
    .then(buildOpportunities)
    .commit();