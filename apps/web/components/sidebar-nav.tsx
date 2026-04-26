'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const iconBaseProps: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const Icon =
  (paths: string[]): IconType =>
  (props) => (
    <svg {...iconBaseProps} {...props}>
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );

export const ICONS: Record<string, IconType> = {
  overview: Icon(['M3 12l9-9 9 9', 'M5 10v10h4v-6h6v6h4V10']),
  content: Icon(['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6', 'M9 13h6', 'M9 17h6']),
  publish: Icon(['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z']),
  tracking: Icon(['M12 2v4', 'M12 18v4', 'M4.93 4.93l2.83 2.83', 'M16.24 16.24l2.83 2.83', 'M2 12h4', 'M18 12h4', 'M4.93 19.07l2.83-2.83', 'M16.24 7.76l2.83-2.83']),
  compliance: Icon(['M9 12l2 2 4-4', 'M12 2L4 5v6c0 6 8 11 8 11s8-5 8-11V5z']),
  attribution: Icon(['M21 21H3', 'M5 21V8', 'M11 21V5', 'M17 21v-7']),
  settings: Icon(['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z']),
  help: Icon(['M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z', 'M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3', 'M12 17h.01']),
};

export type NavItem = {
  href: string;
  label: string;
  iconKey: keyof typeof ICONS;
  /** Optional red badge (e.g. count of pending items needing attention). 0 hides. */
  badge?: number;
};

export function SidebarNav({
  tenantSlug,
  items,
}: {
  tenantSlug: string;
  items: NavItem[];
}) {
  const pathname = usePathname();
  const base = `/t/${tenantSlug}`;

  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const isActive =
          item.href === ''
            ? pathname === base
            : pathname === href || pathname.startsWith(`${href}/`);
        const IconCmp = ICONS[item.iconKey] ?? ICONS.overview!;
        return (
          <Link
            key={item.href}
            href={href}
            className={
              'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ' +
              (isActive
                ? 'bg-white text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:bg-white/70 hover:text-foreground')
            }
          >
            <IconCmp
              className={isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}
            />
            <span className="flex-1">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white"
                title={`待处理 ${item.badge}`}
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
