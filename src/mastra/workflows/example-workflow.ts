import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const analysisSchema = z.object({
  topic: z.string(),
  analysis: z.string(),
});

const analyzeTopic = createStep({
  id: 'analyze-topic',
  description: 'Uses the registered assistant to analyze a topic.',
  inputSchema: z.object({
    topic: z.string().min(1).describe('The topic or text to analyze'),
  }),
  outputSchema: analysisSchema,
  execute: async ({ inputData, mastra }) => {
    const assistant = mastra.getAgent('assistant');
    const response = await assistant.generate(
      `Analyze this topic. Identify its central idea, important considerations, and practical implications:\n\n${inputData.topic}`,
    );

    return { topic: inputData.topic, analysis: response.text };
  },
});

const summarizeAnalysis = createStep({
  id: 'summarize-analysis',
  description: 'Turns the analysis into a concise structured result.',
  inputSchema: analysisSchema,
  outputSchema: z.object({
    topic: z.string(),
    analysis: z.string(),
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const assistant = mastra.getAgent('assistant');
    const response = await assistant.generate(
      `Summarize the analysis below in no more than three concise sentences. Return only the summary.\n\n${inputData.analysis}`,
    );

    return { ...inputData, summary: response.text };
  },
});

export const exampleWorkflow = createWorkflow({
  id: 'example-workflow',
  description: 'Analyzes a topic and returns both the full analysis and a concise summary.',
  inputSchema: z.object({
    topic: z.string().min(1).describe('The topic or text to analyze'),
  }),
  outputSchema: z.object({
    topic: z.string(),
    analysis: z.string(),
    summary: z.string(),
  }),
})
  .then(analyzeTopic)
  .then(summarizeAnalysis)
  .commit();
