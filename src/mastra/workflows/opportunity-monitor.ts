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

  opportunityStrength: z.enum([
    'HIGH',
    'MEDIUM',
    'LOW',
    'UNKNOWN',
  ]),

  opportunityBasis: z.enum([
    'SIGNAL_LED',
    'FIT_LED',
    'SIGNAL_AND_FIT',
    'INSUFFICIENT_DATA',
  ]),

  reason: z.string(),
  investigate: z.boolean(),
});

const opportunitySchema = z.object({
  brand: z.string(),
  opportunityStrength: z.enum(['HIGH', 'MEDIUM']),
  opportunityBasis: z.enum([
    'SIGNAL_LED',
    'FIT_LED',
    'SIGNAL_AND_FIT',
  ]),
  opportunity: z.string(),
  whyNow: z.string(),
  idea: z.string(),
  futureFit: z.string(),
  product: z.string(),
  nextStep: z.string(),
});

const ignoredSchema = z.object({
  brand: z.string(),
  opportunityStrength: z.enum(['LOW', 'UNKNOWN']),
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

        max_output_tokens: 700,
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
    .flatMap(
      (item: any) =>
        item.content ?? [],
    )
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
  const result =
    await tool.execute(
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
RESEARCH WATCHLIST IN PARALLEL
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
    const research =
      await Promise.all(
        inputData.brands.map(
          async brand => {
            const result =
              await runTool<{
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

            return {
              brand,

              brandContext:
                result.brandContext,

              recentSignals:
                result.recentSignals,
            };
          },
        ),
      );

    return { research };
  },
});

/*
========================================================
STEP 2
EVALUATE COMMERCIAL POTENTIAL
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
    const evaluationSchema =
      z.object({
        opportunityStrength:
          z.enum([
            'HIGH',
            'MEDIUM',
            'LOW',
          ]),

        opportunityBasis:
          z.enum([
            'SIGNAL_LED',
            'FIT_LED',
            'SIGNAL_AND_FIT',
          ]),

        reason: z.string(),
      });

    const signals =
      await Promise.all(
        inputData.research.map(
          async item => {
            /*
            --------------------------------------------
            RESEARCH FAILED ENTIRELY
            --------------------------------------------
            */

            const hasContext =
              Boolean(
                item.brandContext.purpose ||
                item.brandContext.targetAudience ||
                item.brandContext.customerPersonas.length,
              );

            if (!hasContext) {
              return {
                brand:
                  item.brand,

                brandContext:
                  item.brandContext,

                recentSignals:
                  item.recentSignals,

                opportunityStrength:
                  'UNKNOWN' as const,

                opportunityBasis:
                  'INSUFFICIENT_DATA' as const,

                reason:
                  'Insufficient brand research to evaluate commercial potential.',

                investigate:
                  false,
              };
            }

            /*
            --------------------------------------------
            EVALUATE BOTH SIGNAL + FIT
            --------------------------------------------
            */

            const evaluation =
              await callModel(
                `
You are deciding whether an advertiser is worth investigating for a proactive media sales opportunity.

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

Evaluate COMMERCIAL POTENTIAL.

There are two valid reasons to investigate:

1. SIGNAL-LED
Something meaningful has recently changed that could create new advertising, marketing or partnership demand.

2. FIT-LED
Even without a major recent development, the advertiser has clear audiences, categories or customer needs that could create a strong media partnership opportunity.

A brand can therefore be worth investigating even when RECENT SIGNALS is empty.

CLASSIFICATION

HIGH
There is a compelling reason to investigate now.

MEDIUM
There is credible commercial potential worth matching against Future's portfolio.

LOW
There is little evidence that further investigation is likely to produce a strong opportunity.

OPPORTUNITY BASIS

SIGNAL_LED
The primary reason is a recent development.

FIT_LED
The primary reason is strong underlying audience/category/customer fit.

SIGNAL_AND_FIT
Both are materially important.

Do not invent Future capabilities here.
You are only deciding whether the advertiser deserves deeper investigation.

Be selective, but do not require recent news.

Return:

{
  "opportunityStrength": "HIGH or MEDIUM or LOW",
  "opportunityBasis": "SIGNAL_LED or FIT_LED or SIGNAL_AND_FIT",
  "reason": "one concise sentence"
}
                `.trim(),

                evaluationSchema,
              );

            return {
              brand:
                item.brand,

              brandContext:
                item.brandContext,

              recentSignals:
                item.recentSignals,

              opportunityStrength:
                evaluation.opportunityStrength,

              opportunityBasis:
                evaluation.opportunityBasis,

              reason:
                evaluation.reason,

              investigate:
                evaluation.opportunityStrength ===
                  'HIGH' ||
                evaluation.opportunityStrength ===
                  'MEDIUM',
            };
          },
        ),
      );

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
      const ignored =
        inputData.signals
          .filter(
            signal =>
              !signal.investigate,
          )
          .map(signal => ({
            brand:
              signal.brand,

            opportunityStrength:
              signal.opportunityStrength as
                | 'LOW'
                | 'UNKNOWN',

            reason:
              signal.reason,
          }));

      const candidates =
        inputData.signals.filter(
          signal =>
            signal.investigate,
        );

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

      /*
      ====================================================
      BUILD EACH CANDIDATE IN PARALLEL
      ====================================================
      */

      const opportunities =
        await Promise.all(
          candidates.map(
            async signal => {
              /*
              --------------------------------------------
              PORTFOLIO + COMMERCIAL MOMENTS IN PARALLEL
              --------------------------------------------
              */

              const [
                portfolio,
                commercial,
              ] = await Promise.all([
                runTool<{
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

Recent signals:
${JSON.stringify(
  signal.recentSignals,
  null,
  2,
)}

Opportunity basis:
${signal.opportunityBasis}

Identify the 3 strongest Future-owned brands, audiences or areas of editorial authority for this advertiser.

Prioritize genuine audience, category and customer fit.

Do not force a match.

Be concise.
                    `.trim(),
                  },
                ),

                runTool<{
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

Recent signals:
${JSON.stringify(
  signal.recentSignals,
  null,
  2,
)}

Opportunity basis:
${signal.opportunityBasis}

Identify up to 3 relevant upcoming Future commercial packages, cultural moments or tentpoles.

Prioritize:
- advertiser relevance
- audience fit
- timing
- genuine commercial potential

If nothing strongly fits, say so.

Be concise.
                    `.trim(),
                  },
                ),
              ]);

              /*
              --------------------------------------------
              PRODUCT
              --------------------------------------------
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

Opportunity basis:
${signal.opportunityBasis}

Future portfolio:
${portfolio.answer}

Commercial opportunities:
${commercial.answer}

Determine which Future product or capability best enables the strongest commercial opportunity.

Compare relevant Future products.

Recommend the strongest supported fit.

Do not invent capabilities.

Be concise.
                    `.trim(),
                  },
                );

              /*
              --------------------------------------------
              SYNTHESIS
              --------------------------------------------
              */

              const synthesis =
                await callModel(
                  `
You are Apollo, Future's commercial opportunity assistant.

Create ONE strong actionable commercial opportunity.

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

OPPORTUNITY STRENGTH
${signal.opportunityStrength}

OPPORTUNITY BASIS
${signal.opportunityBasis}

WHY INVESTIGATED
${signal.reason}

FUTURE PORTFOLIO
${portfolio.answer}

COMMERCIAL PACKAGES / MOMENTS
${commercial.answer}

PRODUCT KNOWLEDGE
${products.answer}

RULES

Create a commercial idea, not a research summary.

Start with the advertiser's need, audience or current priority.

Use the strongest Future assets only.

Prefer ONE strong idea.

Recent news is useful when available, but do not pretend there is a recent trigger if the opportunity is FIT_LED.

If the opportunity is FIT_LED, explain why the audience/category fit makes it commercially interesting now.

An existing commercial package is optional.

A supported Future product or capability must enable the recommendation.

Do not invent:
- Future products
- Future packages
- prices
- audiences
- advertiser priorities

If proposing a new commercial concept, clearly treat it as a proposal.

Return:

{
  "opportunity": "short seller-friendly opportunity name",
  "whyNow": "maximum two concise sentences",
  "idea": "two or three concise sentences explaining what we should pitch",
  "futureFit": "maximum three relevant Future assets or capabilities",
  "product": "recommended Future product or capability and why",
  "nextStep": "one specific seller action"
}
                  `.trim(),

                  synthesisSchema,
                );

              return {
                brand:
                  signal.brand,

                opportunityStrength:
                  signal.opportunityStrength as
                    | 'HIGH'
                    | 'MEDIUM',

                opportunityBasis:
                  signal.opportunityBasis as
                    | 'SIGNAL_LED'
                    | 'FIT_LED'
                    | 'SIGNAL_AND_FIT',

                ...synthesis,
              };
            },
          ),
        );

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