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

const researchItemSchema = z.object({
  brand: z.string(),
  research: z.string(),
});

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

const evaluatedBrandSchema = z.object({
  brand: z.string(),
  research: z.string(),

  brandContext: brandContextSchema,

  recentSignals: z.array(
    recentSignalSchema,
  ),

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

  opportunityStrength: z.enum([
    'HIGH',
    'MEDIUM',
  ]),

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

  opportunityStrength: z.enum([
    'LOW',
    'UNKNOWN',
  ]),

  reason: z.string(),
});

/*
========================================================
HELPERS
========================================================
*/

function extractOutputText(data: any): string {
  return (data.output ?? [])
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
}

async function callJsonModel<T>(
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(
    `${process.env.LITELLM_BASE_URL}/responses`,
    {
      method: 'POST',

      headers: {
        Authorization:
          `Bearer ${process.env.LITELLM_API_KEY}`,

        'Content-Type':
          'application/json',
      },

      body: JSON.stringify({
        model:
          process.env.MODEL_NAME ||
          'gpt-5.6-luna',

        input: `
${prompt}

Return ONLY valid JSON.
Do not use markdown fences.
Do not include text before or after the JSON.
        `.trim(),

        max_output_tokens: 1000,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Model call failed: ${response.status} ${await response.text()}`,
    );
  }

  const data: any =
    await response.json();

  const text =
    extractOutputText(data);

  if (!text) {
    throw new Error(
      'Model returned no output text.',
    );
  }

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(cleaned);
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
RESEARCH BRANDS

One web research call per brand.
Brands run concurrently.
========================================================
*/

const researchBrands = createStep({
  id: 'research-brands',

  inputSchema: z.object({
    brands: z.array(
      z.string(),
    ),
  }),

  outputSchema: z.object({
    research: z.array(
      researchItemSchema,
    ),
  }),

  execute: async ({
    inputData,
  }) => {
    const research =
      await Promise.all(
        inputData.brands.map(
          async brand => {
            try {
              const result =
                await runTool<{
                  research: string;
                }>(
                  brandResearchTool,
                  { brand },
                );

              return {
                brand,
                research:
                  result.research,
              };
            } catch (error) {
              console.error(
                `Brand research failed for ${brand}:`,
                error,
              );

              return {
                brand,
                research: '',
              };
            }
          },
        ),
      );

    return { research };
  },
});

/*
========================================================
STEP 2
UNDERSTAND + EVALUATE BRANDS

No web search here.

This turns the prose research into:
- purpose
- personas
- audience
- recent signals
- opportunity score
========================================================
*/

const evaluateBrands = createStep({
  id: 'evaluate-brands',

  inputSchema: z.object({
    research: z.array(
      researchItemSchema,
    ),
  }),

  outputSchema: z.object({
    brands: z.array(
      evaluatedBrandSchema,
    ),
  }),

  execute: async ({
    inputData,
  }) => {
    const evaluationSchema =
      z.object({
        brandContext:
          brandContextSchema,

        recentSignals:
          z.array(
            recentSignalSchema,
          ),

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

        reason:
          z.string(),
      });

    const brands =
      await Promise.all(
        inputData.research.map(
          async item => {
            if (!item.research) {
              return {
                brand:
                  item.brand,

                research: '',

                brandContext: {
                  purpose: '',
                  customerPersonas: [],
                  targetAudience: '',
                },

                recentSignals: [],

                opportunityStrength:
                  'UNKNOWN' as const,

                opportunityBasis:
                  'INSUFFICIENT_DATA' as const,

                reason:
                  'Brand research was unavailable.',

                investigate:
                  false,
              };
            }

            try {
              const evaluation =
                await callJsonModel(
                  `
You are evaluating ${item.brand} for proactive advertising and media sales opportunities.

RESEARCH

${item.research}

Extract the advertiser context from the research:

- purpose or positioning
- up to 3 important customer personas
- target audience
- recent commercially relevant developments

Then decide whether this advertiser deserves deeper commercial investigation.

There are two legitimate reasons to investigate.

SIGNAL_LED:
A meaningful recent development creates potential new advertising, marketing or partnership demand.

FIT_LED:
The advertiser has a strong audience, category or customer need that could create a valuable media partnership even without major recent news.

SIGNAL_AND_FIT:
Both are materially important.

A brand does NOT need recent news to qualify.

Score:

HIGH:
Compelling commercial potential.

MEDIUM:
Credible commercial potential worth matching against Future.

LOW:
Little evidence that deeper investigation is likely to create a strong opportunity.

Only use facts contained in the supplied research.

Return:

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
      "signal": "concise development",
      "relevance": "why it matters commercially",
      "source": "source and date"
    }
  ],
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

                research:
                  item.research,

                brandContext:
                  evaluation.brandContext,

                recentSignals:
                  evaluation.recentSignals,

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
            } catch (error) {
              console.error(
                `Brand evaluation failed for ${item.brand}:`,
                error,
              );

              return {
                brand:
                  item.brand,

                research:
                  item.research,

                brandContext: {
                  purpose: '',
                  customerPersonas: [],
                  targetAudience: '',
                },

                recentSignals: [],

                opportunityStrength:
                  'UNKNOWN' as const,

                opportunityBasis:
                  'INSUFFICIENT_DATA' as const,

                reason:
                  'Brand research could not be evaluated reliably.',

                investigate:
                  false,
              };
            }
          },
        ),
      );

    return { brands };
  },
});

/*
========================================================
STEP 3
BUILD OPPORTUNITIES

Only HIGH / MEDIUM brands reach here.
========================================================
*/

const buildOpportunities =
  createStep({
    id: 'build-opportunities',

    inputSchema: z.object({
      brands: z.array(
        evaluatedBrandSchema,
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
        inputData.brands
          .filter(
            brand =>
              !brand.investigate,
          )
          .map(brand => ({
            brand:
              brand.brand,

            opportunityStrength:
              brand.opportunityStrength as
                | 'LOW'
                | 'UNKNOWN',

            reason:
              brand.reason,
          }));

      const candidates =
        inputData.brands.filter(
          brand =>
            brand.investigate,
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

      const opportunities =
        await Promise.all(
          candidates.map(
            async brand => {
              /*
              ============================================
              FUTURE MATCHING

              Portfolio and commercial moments can
              run concurrently.
              ============================================
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
${brand.brand}

Purpose:
${brand.brandContext.purpose}

Target audience:
${brand.brandContext.targetAudience}

Customer personas:
${brand.brandContext.customerPersonas.join(
  ', ',
)}

Recent signals:
${JSON.stringify(
  brand.recentSignals,
  null,
  2,
)}

Identify the 3 strongest Future-owned brands, audiences or areas of editorial authority for this advertiser.

Prioritize genuine audience and category fit.

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
${brand.brand}

Purpose:
${brand.brandContext.purpose}

Target audience:
${brand.brandContext.targetAudience}

Customer personas:
${brand.brandContext.customerPersonas.join(
  ', ',
)}

Recent signals:
${JSON.stringify(
  brand.recentSignals,
  null,
  2,
)}

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
              ============================================
              PRODUCT MATCH
              ============================================
              */

              const product =
                await runTool<{
                  answer: string;
                }>(
                  productKnowledgeTool,
                  {
                    question: `
Advertiser:
${brand.brand}

Purpose:
${brand.brandContext.purpose}

Target audience:
${brand.brandContext.targetAudience}

Customer personas:
${brand.brandContext.customerPersonas.join(
  ', ',
)}

Recent signals:
${JSON.stringify(
  brand.recentSignals,
  null,
  2,
)}

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
              ============================================
              SYNTHESIS
              ============================================
              */

              const synthesis =
                await callJsonModel(
                  `
You are Apollo, Future's commercial opportunity assistant.

Create ONE strong, actionable commercial opportunity for ${brand.brand}.

BRAND PURPOSE
${brand.brandContext.purpose}

TARGET AUDIENCE
${brand.brandContext.targetAudience}

CUSTOMER PERSONAS
${brand.brandContext.customerPersonas.join(
  ', ',
)}

RECENT SIGNALS
${JSON.stringify(
  brand.recentSignals,
  null,
  2,
)}

OPPORTUNITY STRENGTH
${brand.opportunityStrength}

OPPORTUNITY BASIS
${brand.opportunityBasis}

WHY THIS WAS INVESTIGATED
${brand.reason}

FUTURE PORTFOLIO
${portfolio.answer}

COMMERCIAL PACKAGES / MOMENTS
${commercial.answer}

PRODUCT KNOWLEDGE
${product.answer}

Create a commercial idea, not a research summary.

Start with the advertiser's need, audience or current priority.

Use only the strongest relevant Future assets.

Prefer ONE strong idea.

If this is FIT_LED, do not invent a recent trigger.

An existing Future package is optional.

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
  "opportunity": "short seller-friendly name",
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
                  brand.brand,

                opportunityStrength:
                  brand.opportunityStrength as
                    | 'HIGH'
                    | 'MEDIUM',

                opportunityBasis:
                  brand.opportunityBasis as
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
    .then(evaluateBrands)
    .then(buildOpportunities)
    .commit();