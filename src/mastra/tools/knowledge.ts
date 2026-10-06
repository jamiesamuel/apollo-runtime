import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const knowledgeTool = createTool({
  id: 'knowledge',

  description:
    'Search Future commercial product knowledge. Use knowledgeSource when you know which product or knowledge source is relevant.',

  inputSchema: z.object({
    question: z.string().describe('The question to answer'),
    knowledgeSource: z
      .string()
      .optional()
      .describe('Optional knowledge source, for example Optic or Aperture'),
  }),

  outputSchema: z.object({
    answer: z.string(),
  }),

  execute: async ({ question, knowledgeSource }) => {
    const fileSearchTool = {
      type: 'file_search',
      vector_store_ids: [process.env.KNOWLEDGE_VECTOR_STORE_ID],
      ...(knowledgeSource
        ? {
            filters: {
              type: 'eq',
              key: 'knowledge_source',
              value: knowledgeSource,
            },
          }
        : {}),
    };

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
          input: question,
          tools: [fileSearchTool],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Knowledge search failed: ${response.status} ${await response.text()}`,
      );
    }

    const data: any = await response.json();

    const answer = data.output
      ?.flatMap((item: any) => item.content ?? [])
      ?.find((content: any) => content.type === 'output_text')
      ?.text;

    return {
      answer: answer ?? 'No answer was returned from the knowledge base.',
    };
  },
});