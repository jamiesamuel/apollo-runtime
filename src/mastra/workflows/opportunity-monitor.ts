import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { brandResearchTool } from '../tools/brand-research.js';
import { futurePortfolioTool } from '../tools/future-portfolio.js';
import { commercialOpportunitiesTool } from '../tools/commercial-opportunities.js';
import { productKnowledgeTool } from '../tools/product-knowledge.js';
import { opticIntentTool } from '../tools/optic-intent.js';

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

  opticIntent: z.string(),

  sellerEmailSubject: z.string(),
  sellerEmail: z.string(),

  clientEmailSubject: z.string(),
  clientEmail: z.string(),
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

function extractOutputText(
  data: any,
): string {
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
  let lastError: Error | null =
    null;

  /*
  One retry for transient LiteLLM /
  Responses failures.

  We do NOT repeat web research here.
  */

  for (
    let attempt = 1;
    attempt <= 2;
    attempt++
  ) {
    try {
      const response =
        await fetch(
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

              max_output_tokens:
                1400,
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
        .replace(
          /^```json\s*/i,
          '',
        )
        .replace(
          /^```\s*/i,
          '',
        )
        .replace(
          /\s*```$/i,
          '',
        )
        .trim();

      const parsed =
        JSON.parse(cleaned);

      return schema.parse(
        parsed,
      );
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(
              String(error),
            );

      console.error(
        `Model call attempt ${attempt} failed:`,
        lastError.message,
      );

      if (attempt < 2) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              1000,
            ),
        );
      }
    }
  }

  throw (
    lastError ??
    new Error(
      'Model call failed.',
    )
  );
}

async function runTool<T>(
  tool: any,
  input: Record<
    string,
    unknown
  >,
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

Output is normal prose, not JSON.
========================================================
*/

const researchBrands =
  createStep({
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
UNDERSTAND + QUALIFY BRANDS

No web search.

Turn the research into:
- brand purpose
- personas
- audience
- recent signals
- opportunity strength
========================================================
*/

const evaluateBrands =
  createStep({
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
              if (
                !item.research
              ) {
                return {
                  brand:
                    item.brand,

                  research: '',

                  brandContext: {
                    purpose: '',
                    customerPersonas:
                      [],
                    targetAudience:
                      '',
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

WEB RESEARCH

${item.research}

First extract:

1. Brand purpose or positioning
2. Up to 3 important customer personas
3. Target audience
4. Any recent commercially relevant developments contained in the research

Then decide whether this advertiser deserves deeper commercial investigation.

There are TWO legitimate reasons to investigate.

SIGNAL_LED

A meaningful recent development creates potential new advertising, marketing or partnership demand.

FIT_LED

The advertiser has a strong audience, category or customer need that could create a valuable media partnership even without major recent news.

SIGNAL_AND_FIT

Both are materially important.

A brand does NOT need recent news to qualify.

CLASSIFICATION

HIGH

Compelling commercial potential.

MEDIUM

Credible commercial potential worth matching against Future.

LOW

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
                    customerPersonas:
                      [],
                    targetAudience:
                      '',
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

Only HIGH / MEDIUM candidates continue.

Flow:

Future portfolio
        +
Commercial opportunities
        ↓
Product knowledge
        ↓
If Optic relevant:
Optic intent research
        ↓
Opportunity
        ↓
Seller email
        ↓
Proposed client email
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
      /*
      --------------------------------------------
      IGNORE NON-CANDIDATES
      --------------------------------------------
      */

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

      /*
      --------------------------------------------
      FINAL OUTPUT SCHEMA
      --------------------------------------------
      */

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

          opticIntent:
            z.string(),

          sellerEmailSubject:
            z.string(),

          sellerEmail:
            z.string(),

          clientEmailSubject:
            z.string(),

          clientEmail:
            z.string(),
        });

      /*
      --------------------------------------------
      PROCESS QUALIFIED BRANDS CONCURRENTLY
      --------------------------------------------
      */

      const opportunities =
        await Promise.all(
          candidates.map(
            async brand => {
              /*
              ============================================
              FUTURE PORTFOLIO +
              COMMERCIAL OPPORTUNITIES

              These can run concurrently.
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
              PRODUCT KNOWLEDGE
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

Determine which Future commercial product or capability best enables the strongest opportunity.

Compare relevant Future products and capabilities.

The product recommendation should be a Future commercial product or capability, not merely the name of an editorial package or cultural moment.

Recommend the strongest supported fit.

Do not invent capabilities.

Be concise.
                    `.trim(),
                  },
                );

              /*
              ============================================
              OPTIC INTENT

              Only run if Product Knowledge suggests
              Optic is relevant.
              ============================================
              */

              const opticRelevant =
                /\boptic\b/i.test(
                  product.answer,
                );

              let opticIntent =
                'Optic was not identified as a relevant Future product, so no additional GEO or AI-discovery intent research was run.';

              if (opticRelevant) {
                try {
                  const result =
                    await runTool<{
                      research: string;
                    }>(
                      opticIntentTool,
                      {
                        brand:
                          brand.brand,
                      },
                    );

                  opticIntent =
                    result.research;
                } catch (error) {
                  console.error(
                    `Optic intent research failed for ${brand.brand}:`,
                    error,
                  );

                  opticIntent =
                    'Optic appears relevant, but public GEO or AI-discovery intent research could not be completed.';
                }
              }

              /*
              ============================================
              FINAL SYNTHESIS

              Opportunity
              +
              Seller email
              +
              Client email
              ============================================
              */

              const synthesis =
                await callJsonModel(
                  `
You are Apollo, Future's proactive commercial opportunity assistant.

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

WHY THIS BRAND WAS INVESTIGATED

${brand.reason}

FUTURE PORTFOLIO

${portfolio.answer}

COMMERCIAL PACKAGES / MOMENTS

${commercial.answer}

PRODUCT KNOWLEDGE

${product.answer}

OPTIC INTENT RESEARCH

${opticIntent}

COMMERCIAL OPPORTUNITY RULES

Create a commercial idea, not a research summary.

Start with the advertiser's need, audience or current priority.

Use only the strongest relevant Future assets.

Prefer ONE strong idea.

If this is FIT_LED, do not invent or imply a recent trigger.

If this is SIGNAL_LED or SIGNAL_AND_FIT, use only recent developments supported by the supplied research.

An existing Future commercial package is optional.

A supported Future commercial product or capability must enable the recommendation.

Do not confuse an editorial package or cultural moment with the Future product/capability recommendation.

Do not invent:
- Future products
- Future packages
- prices
- audiences
- advertiser priorities
- client activity
- executive statements

If proposing a new commercial concept, clearly treat it as a proposal rather than an existing Future package.

OPTIC RULES

If Optic is recommended:

Use the Optic intent research to determine whether the opportunity is supported by explicit client intent or is simply a strong strategic fit.

If the brand, CMO or marketing leadership has explicitly discussed:
- Generative Engine Optimization
- GEO
- AI discovery
- AI search
- LLM visibility
- answer engines
- agentic shopping

then surface that as an important reason to engage.

If there is no explicit public evidence, Optic may still be recommended based on strategic fit.

However, NEVER imply that the client has declared GEO or AI discovery as a priority unless the Optic intent research explicitly supports it.

Never invent a statement from a CMO, executive or brand.

SELLER EMAIL

Write a concise proactive INTERNAL email to the Future seller responsible for this advertiser.

The seller email must explain:

1. What we know about the client and what they appear to be focused on.
2. Why this creates a potential commercial opportunity for Future.
3. The ONE opportunity Apollo recommends.
4. The relevant Future brands, package/moment and commercial product/capability.
5. Why the seller should engage now.
6. The recommended next action.

If Optic is recommended, explicitly distinguish between:
- public evidence that the client is interested in GEO / AI discovery
- Optic simply being a strong strategic fit

Do not overstate certainty.

End by telling the seller that a proposed client email is included below.

CLIENT EMAIL

Write a short proposed email that the seller can edit and send to the client.

The client email must:

- sound natural and human
- be concise
- start from a supported client priority, audience or public development
- introduce ONE relevant Future idea
- explain why Future can add value
- finish with a simple request to discuss

Do NOT mention:
- Apollo
- opportunity scoring
- FIT_LED
- SIGNAL_LED
- internal Future research
- internal Future processes
- model analysis

Do not claim knowledge of a client's strategy unless supported by the supplied evidence.

Never claim that the client has an AI, GEO or AI-discovery priority unless the Optic intent research explicitly supports it.

Do not present a proposed commercial concept as though it is an existing Future package.

Return:

{
  "opportunity": "short seller-friendly opportunity name",

  "whyNow": "maximum two concise sentences explaining why this is commercially relevant",

  "idea": "two or three concise sentences explaining what Future should pitch",

  "futureFit": "maximum three relevant Future brands, packages, moments or capabilities",

  "product": "recommended Future commercial product or capability and why",

  "nextStep": "one specific action for the seller",

  "opticIntent": "concise summary of explicit GEO / AI-discovery evidence, or clearly state that no explicit evidence was found or Optic was not investigated",

  "sellerEmailSubject": "Apollo opportunity: [Brand] - [short opportunity name]",

  "sellerEmail": "complete concise internal email to the seller",

  "clientEmailSubject": "short natural client-facing subject",

  "clientEmail": "complete concise proposed client-facing email"
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