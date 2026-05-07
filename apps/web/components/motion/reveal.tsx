'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Stagger-on-mount wrapper — fades + lifts children with a small delay
 * after hydration. Use to stagger panels into view (delay={i * 80}).
 *
 * Pure mount trigger (no IntersectionObserver) — keeps the animation
 * deterministic and headless-screenshot-friendly. For below-fold content
 * the appear animation will have completed by the time it scrolls in.
 *
 * Respects prefers-reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  distance = 16,
  duration = 700,
  className,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : `translateY(${distance}px)`,
        transition: `opacity ${duration}ms cubic-bezier(0.22,1,0.36,1), transform ${duration}ms cubic-bezier(0.22,1,0.36,1)`,
        willChange: visible ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}
