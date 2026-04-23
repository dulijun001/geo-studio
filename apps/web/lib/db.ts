/**
 * Re-export of @geo/db configured for the web app runtime.
 * Keep this the ONLY place in apps/web that imports from @geo/db,
 * so swapping runtimes (e.g. Edge Runtime compatibility) is a one-file change.
 */
export { db, schema, createDb } from '@geo/db';
export type { Database } from '@geo/db';
