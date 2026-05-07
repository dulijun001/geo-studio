'use client';

import { useEffect, useRef } from 'react';

/**
 * Cursor-following emerald spotlight — fixed translucent radial glow
 * that lerps to the mouse position. Adds Linear-style "alive" feeling
 * to dark surfaces.
 *
 * Place once near the root of a tenant layout. Disabled on touch and
 * reduced-motion.
 */
export function SpotlightCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) return; // touch
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const el = ref.current;
    if (!el) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let curX = targetX;
    let curY = targetY;
    let raf = 0;
    let visible = false;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const animate = () => {
      curX = lerp(curX, targetX, 0.12);
      curY = lerp(curY, targetY, 0.12);
      el.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
      raf = requestAnimationFrame(animate);
    };

    const onMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!visible) {
        el.style.opacity = '1';
        visible = true;
      }
    };
    const onLeave = () => {
      el.style.opacity = '0';
      visible = false;
    };

    raf = requestAnimationFrame(animate);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-0 -ml-[300px] -mt-[300px] h-[600px] w-[600px] rounded-full opacity-0 transition-opacity duration-300"
      style={{
        background:
          'radial-gradient(closest-side, rgba(52,211,153,0.12), rgba(52,211,153,0.04) 40%, transparent 70%)',
        mixBlendMode: 'screen',
      }}
    />
  );
}
