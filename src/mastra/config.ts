import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  MODEL_PROVIDER: z.enum(['openai', 'anthropic', 'google']).default('openai'),
  MODEL_NAME: z.string().min(1).default('gpt-4o-mini'),
  SYSTEM_PROMPT: z.string().min(1).default('You are a helpful AI assistant.'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4111),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

export function getModelIdentifier(config: AppConfig): `${AppConfig['MODEL_PROVIDER']}/${string}` {
  return `${config.MODEL_PROVIDER}/${config.MODEL_NAME}`;
}
