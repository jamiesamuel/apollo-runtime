import { PostgresStore } from '@mastra/pg';

export function createPostgresStorage(connectionString: string): PostgresStore {
  return new PostgresStore({
    id: 'mastra-postgres-storage',
    connectionString,
  });
}
