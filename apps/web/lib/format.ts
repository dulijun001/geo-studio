/**
 * Date formatting helpers pinned to Asia/Shanghai.
 *
 * Why a helper exists at all: `new Date(x).toLocaleString('zh-CN', ...)` without
 * an explicit timeZone option formats in the runtime's local TZ. Server runs in
 * whatever TZ the OS is configured for (often UTC on Alibaba ECS), client runs
 * in the user's browser TZ (Asia/Shanghai for our users). The two diverge by
 * 8 hours, which produces a different string on every server-rendered date and
 * triggers React hydration mismatches on every row. With many dates on a page
 * the cumulative mismatches escalate into a global error boundary trip.
 *
 * Always go through these helpers in server-rendered code paths.
 */

const TZ = 'Asia/Shanghai';

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Full datetime: 2026/05/01 14:43:21 — for audit / detail rows. */
export function fmtDateTime(input: DateInput, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return d.toLocaleString('zh-CN', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Compact datetime without seconds: 05/01 14:43 — for table cells. */
export function fmtDateShort(input: DateInput, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return d.toLocaleString('zh-CN', {
    timeZone: TZ,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Date only: 05/01 — for cells that don't need time-of-day. */
export function fmtDateOnly(input: DateInput, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return d.toLocaleString('zh-CN', {
    timeZone: TZ,
    month: '2-digit',
    day: '2-digit',
  });
}
