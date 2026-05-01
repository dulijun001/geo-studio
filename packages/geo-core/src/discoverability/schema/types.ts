/**
 * JSON-LD output types for Schema.org generators.
 *
 * Why we use plain objects rather than schema-dts: this codebase ships zero
 * schema-graph dependencies, and we only emit a fixed handful of types. A
 * tighter ad-hoc shape gives clearer errors and avoids ~600KB of typings.
 *
 * D18 enforced via `clean()` — every builder runs its output through clean
 * before returning, so undefined / null / empty-array / empty-string fields
 * never end up in the emitted JSON.
 */

/** schema.org context URL. Builders always emit this verbatim. */
export const SCHEMA_ORG = 'https://schema.org' as const;

/**
 * JSON-LD shape. `@context` typed as plain string because clean() is a
 * generic helper that erases literal types — runtime correctness is enforced
 * by builders always passing SCHEMA_ORG.
 */
export type JsonLd<T extends string = string> = {
  '@context'?: string;
  '@type': T;
  '@id'?: string;
  [key: string]: unknown;
};

/** Reference-only object that points at another schema by URL or @id. */
export type JsonLdRef = {
  '@id': string;
  '@type'?: string;
};

/** Common day-of-week values per schema.org/DayOfWeek. */
export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export const DAY_NAMES: Record<string, DayOfWeek> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
