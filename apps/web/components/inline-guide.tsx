'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Dismissable per-page guide card. Stores dismissal in localStorage under the
 * given storageKey so it doesn't reappear on refresh.
 *
 * Usage:
 *   <InlineGuide storageKey="guide:tracking">
 *     <strong>这页是什么</strong>
 *     <p>...</p>
 *   </InlineGuide>
 */
export function InlineGuide({
  storageKey,
  title,
  body,
  steps,
  linkLabel,
  linkHref,
}: {
  storageKey: string;
  title: string;
  body?: string;
  steps?: string[];
  linkLabel?: string;
  linkHref?: string;
}) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  if (dismissed === null) return null; // SSR placeholder
  if (dismissed) return null;

  const onClose = () => {
    localStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  return (
    <aside className="relative overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-teal-500/[0.05] p-5">
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭引导"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full gradient-brand text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-medium text-foreground">{title}</p>
          {body ? <p className="text-sm leading-relaxed text-muted-foreground">{body}</p> : null}
          {steps && steps.length > 0 ? (
            <ol className="ml-1 list-decimal space-y-0.5 pl-4 text-sm text-muted-foreground marker:text-muted-foreground/60">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : null}
          {linkLabel && linkHref ? (
            <Link
              href={linkHref}
              className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-emerald-400 hover:underline underline-offset-2"
            >
              {linkLabel} →
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
