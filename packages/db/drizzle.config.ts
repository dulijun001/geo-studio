import { defineConfig } from 'drizzle-kit';

// DATABASE_URL is only required for `drizzle-kit migrate | push | studio`.
// `drizzle-kit generate` works from schema files alone, so we fall back to a
// placeholder when the env is missing — the real commands will still fail fast.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/placeholder';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: '../../supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
