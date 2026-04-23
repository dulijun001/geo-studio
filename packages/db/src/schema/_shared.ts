import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Standard timestamp columns added to every business table.
 * Use via spread: `...timestamps()` inside pgTable body.
 */
export const timestamps = () => ({
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});

/** Every business row gets a uuid primary key. */
export const pk = () =>
  uuid('id').primaryKey().default(sql`gen_random_uuid()`);

/** Foreign key to tenants.id; mandatory on every tenant-scoped table. */
export const tenantFk = () => uuid('tenant_id').notNull();
