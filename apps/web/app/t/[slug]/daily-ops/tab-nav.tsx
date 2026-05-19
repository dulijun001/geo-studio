import Link from 'next/link';

export type DailyOpsTab = 'today' | 'manual' | 'settings';

const TABS: Array<{ key: DailyOpsTab; label: string }> = [
  { key: 'today', label: '今日待审' },
  { key: 'manual', label: '手填位' },
  { key: 'settings', label: '设置' },
];

export function TabNav({
  slug,
  active,
}: {
  slug: string;
  active: DailyOpsTab;
}) {
  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const isActive = t.key === active;
        const href = t.key === 'today'
          ? `/t/${slug}/daily-ops`
          : `/t/${slug}/daily-ops?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            className={
              isActive
                ? 'rounded-t-md border-b-2 border-emerald-400 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300'
                : 'rounded-t-md border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground'
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
