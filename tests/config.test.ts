import { describe, expect, it } from 'vitest';
import { getModelIdentifier, loadConfig } from '../src/mastra/config.js';

describe('environment configuration', () => {
  it('loads defaults without requiring an AI provider key', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://postgres:password@localhost:5432/mastra',
    });

    expect(config.PORT).toBe(4111);
    expect(getModelIdentifier(config)).toBe('openai/gpt-4o-mini');
  });

  it('rejects unsupported providers', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://postgres:password@localhost:5432/mastra',
        MODEL_PROVIDER: 'unsupported',
      }),
    ).toThrow('MODEL_PROVIDER');
  });

  it('requires PostgreSQL storage', () => {
    expect(() => loadConfig({ DATABASE_URL: 'file:local.db' })).toThrow('DATABASE_URL');
  });
});
