'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animated number ticker — eases from 0 (or last value) to target with
 * cubic ease-out. Use for hero KPIs, percentages, counters.
 *
 * Pure React, no framer-motion. Respects prefers-reduced-motion.
 *
 * Note: API uses `decimals` (number) instead of a format callback because
 * RSC can't pass functions to Client Components in Next.js 14.
 */
export function AnimatedNumber({
  value,
  duration = 1200,
  decimals = 1,
  prefix = '',
  suffix = '',
}: {
  value: number;
  duration?: number;
  /** number of decimal places; default 1 */
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplay(value);
      return;
    }

    const from = startedRef.current ? fromRef.current : 0;
    const to = value;
    const t0 = performance.now();
    let raf = 0;

    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      setDisplay(v);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    startedRef.current = true;
    fromRef.current = from;
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </>
  );
}
