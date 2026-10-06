import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

type KnowledgeSearchOptions = {
  question: string;
  knowledgeType?: string;
  knowledgeScope?: string;
};

export async function searchKnowledge({
  question,
  knowledgeType,
  knowledgeScope,
}: KnowledgeSearchOptions): Promise<string> {
  const filters: any[] = [];

  if (knowledgeType) {
    filters.push({
      type: 'eq',
      key: 'knowledge_type',
      value: knowledgeType,
    });
  }

  if (knowledgeScope) {
    filters.push({
      type: 'eq',
      key: 'knowledge_scope',
      value: knowledgeScope,
    });
  }

  const fileSearchTool = {
    type: 'file_search',
    vector_store_ids: [process.env.KNOWLEDGE_VECTOR_STORE_ID],
    ...(filters.length === 1
      ? { filters: filters[0] }
      : filters.length > 1
        ? {
            filters: {
              type: 'and',
              filters,
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
        max_output_tokens: 800,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Knowledge search failed: ${response.status} ${await response.text()}`,
    );
  }

  const data: any = await response.json();

  return (
    data.output
      ?.flatMap((item: any) => item.content ?? [])
      ?.find((content: any) => content.type === 'output_text')
      ?.text ?? 'No relevant knowledge was found.'
  );
}

export const knowledgeTool = createTool({
  id: 'knowledge',

  description:
    'Search Future internal knowledge when a more specific knowledge tool is not appropriate.',

  inputSchema: z.object({
    question: z.string(),
    knowledgeType: z.string().optional(),
    knowledgeScope: z.string().optional(),
  }),

  outputSchema: z.object({
    answer: z.string(),
  }),

  execute: async ({ question, knowledgeType, knowledgeScope }) => ({
    answer: await searchKnowledge({
      question,
      knowledgeType,
      knowledgeScope,
    }),
  }),
});