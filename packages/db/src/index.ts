import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export * from './schema/index';
export { schema };

let _client: postgres.Sql | undefined;

function getClient(): postgres.Sql {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return _client;
}

export type Database = ReturnType<typeof createDb>;

export function createDb() {
  return drizzle(getClient(), { schema, logger: process.env.NODE_ENV === 'development' });
}

export const db = createDb();
