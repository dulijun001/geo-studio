'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ⌘K Command Palette — Linear-style global navigation.
 * Press Cmd+K (Mac) or Ctrl+K (Windows/Linux) anywhere in the tenant
 * workspace to open. Navigate with ↑↓, jump with Enter, dismiss with Esc.
 *
 * Pure React, no dependencies. Items are passed in from the server-side
 * layout so role-filtering stays consistent with the sidebar.
 */

export type CommandItem = {
  /** Path appended to /t/<slug> ; '' = overview */
  href: string;
  label: string;
  /** Optional one-line hint shown to the right */
  hint?: string;
  /** Free-text shortcut keywords that match search */
  keywords?: string;
};

export function CommandPalette({
  tenantSlug,
  tenantName,
  items,
}: {
  tenantSlug: string;
  tenantName: string;
  items: CommandItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter
  const filtered = items.filter((it) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      it.label.toLowerCase().includes(q) ||
      (it.hint && it.hint.toLowerCase().includes(q)) ||
      (it.keywords && it.keywords.toLowerCase().includes(q))
    );
  });

  // Reset active row when filter changes
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    } else {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  // ↑↓ navigation + Enter jump
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = filtered[active];
      if (it) navigate(it);
    }
  };

  const navigate = (it: CommandItem) => {
    setOpen(false);
    router.push(`/t/${tenantSlug}${it.href}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]"
      onClick={() => setOpen(false)}
    >
      {/* backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'rgba(8,9,10,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* panel */}
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl"
        style={{
          background: '#0e0f12',
          boxShadow:
            '0 28px 60px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08), 0 0 80px -20px rgba(52,211,153,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onListKey}
      >
        {/* search */}
        <div
          className="flex items-center gap-3 border-b px-5 py-4"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#71717a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-shrink-0"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`搜索 ${tenantName} 工作台 — 输入关键词`}
            className="w-full border-0 bg-transparent text-base outline-none placeholder:text-zinc-600"
            style={{ color: '#fafafa' }}
          />
          <kbd
            className="hidden rounded px-2 py-0.5 font-mono text-[10px] font-semibold sm:inline-block"
            style={{
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: '#71717a',
              letterSpacing: '0.06em',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* list */}
        <div className="max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">
              没找到匹配「{query}」的页面
            </div>
          ) : (
            <ul className="py-2">
              {filtered.map((it, i) => {
                const isActive = i === active;
                return (
                  <li key={it.href || 'overview'}>
                    <button
                      type="button"
                      onClick={() => navigate(it)}
                      onMouseEnter={() => setActive(i)}
                      className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition"
                      style={{
                        background: isActive
                          ? 'rgba(52,211,153,0.10)'
                          : 'transparent',
                        color: isActive ? '#fafafa' : '#a1a1aa',
                        borderLeft: isActive
                          ? '2px solid #34d399'
                          : '2px solid transparent',
                      }}
                    >
                      <span
                        className="font-mono text-[10px] uppercase tracking-wider"
                        style={{
                          color: isActive ? '#34d399' : '#52525b',
                          minWidth: '36px',
                        }}
                      >
                        GO
                      </span>
                      <span className="flex-1 font-medium" style={{ color: isActive ? '#fafafa' : '#d4d4d8' }}>
                        {it.label}
                      </span>
                      {it.hint ? (
                        <span className="text-[12px]" style={{ color: '#71717a' }}>
                          {it.hint}
                        </span>
                      ) : null}
                      {isActive ? (
                        <span className="text-emerald-400">↵</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* footer */}
        <div
          className="flex items-center justify-between border-t px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{
            borderColor: 'rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
            color: '#52525b',
          }}
        >
          <span>{filtered.length} / {items.length} 项</span>
          <span className="flex items-center gap-3">
            <span><Kbd>↑</Kbd><Kbd>↓</Kbd> 导航</span>
            <span><Kbd>↵</Kbd> 跳转</span>
            <span><Kbd>⌘K</Kbd> 切换</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="mr-0.5 inline-block rounded px-1 py-0.5 font-mono text-[9px]"
      style={{
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        color: '#a1a1aa',
        minWidth: '14px',
      }}
    >
      {children}
    </kbd>
  );
}

/**
 * Floating ⌘K hint button (bottom-right). Shows the shortcut so users
 * discover the feature; clicking it opens the palette via a custom event.
 */
export function CommandPaletteHint() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        // we know palette is being toggled
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        // synthesize a Cmd+K keydown for the listener
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
        );
      }}
      className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition hover:opacity-90 md:inline-flex"
      style={{
        background: 'rgba(8,9,10,0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.10)',
        color: '#a1a1aa',
        boxShadow:
          '0 8px 24px -8px rgba(0,0,0,0.5), 0 0 24px -8px rgba(52,211,153,0.20)',
      }}
      aria-label="打开命令面板（Cmd+K）"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <span>跳转</span>
      <span
        className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
        style={{
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.04)',
          color: '#fafafa',
        }}
      >
        ⌘K
      </span>
    </button>
  );
}
