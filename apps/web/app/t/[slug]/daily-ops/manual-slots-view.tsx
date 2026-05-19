/**
 * V1.10 /daily-ops Hub — "手填位" tab 内容.
 * Extracted from app/t/[slug]/today/manual-slots/page.tsx.
 */
import Link from 'next/link';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { ManualSlotsEditor } from '../today/manual-slots/editor';
import type { ManualSlotInput } from '../today/manual-slots/actions';

const ALL_PLATFORMS = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'douyin_script', label: '抖音脚本' },
  { value: 'wechat_mp', label: '公众号' },
  { value: 'zhihu', label: '知乎' },
  { value: 'toutiao_article', label: '头条文章' },
] as const;

function sanitize(raw: unknown): ManualSlotInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ManualSlotInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    out.push({
      topic: typeof o.topic === 'string' ? o.topic : '',
      audience: typeof o.audience === 'string' ? o.audience : '',
      platforms: Array.isArray(o.platforms)
        ? o.platforms.filter((p): p is string => typeof p === 'string')
        : [],
    });
  }
  return out;
}

export async function ManualSlotsView({
  slug,
  tenantId,
}: {
  slug: string;
  tenantId: string;
}) {
  const service = getSupabaseServiceClient();

  const { data: settings } = await service
    .from('daily_ops_settings')
    .select('manual_slot_max, pending_manual_slots, enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const cap = (settings?.manual_slot_max as number | undefined) ?? 2;
  const initial = sanitize(settings?.pending_manual_slots);
  const enabled = (settings?.enabled as boolean | undefined) ?? false;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          想让系统每天写某个固定主题?在这里填,凌晨 02:00 cron 一并跑。剩下的{' '}
          <Link href={`/t/${slug}/daily-ops?tab=settings`} className="text-foreground underline">
            自动选题
          </Link>{' '}
          配额由系统从问题库按优先级抽。最多 {cap} 个 · 改后立即影响下一次凌晨 cron。
        </p>
        {!enabled && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            ⚠️ daily-ops 总开关当前关闭。即使填了手填位,凌晨 cron 也不会跑。
            <Link
              href={`/t/${slug}/daily-ops?tab=settings`}
              className="ml-2 underline"
            >
              去开启
            </Link>
          </p>
        )}
      </div>

      <ManualSlotsEditor
        tenantSlug={slug}
        cap={cap}
        initial={initial}
        platforms={ALL_PLATFORMS as readonly { value: string; label: string }[]}
      />

      <section className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">关于"前一日 23:59 锁定"</strong>:
          V1.10 简化为"什么时候改都行,下一次 cron 用当前值",不做显式锁。
        </p>
        <p>
          <strong className="text-foreground">为什么不直接自动跑</strong>:
          自动派单到平台 App 是 D3 红线(员工实名号封号风险),手填位只是给 AI
          指定题目 + 平台,生成内容仍然走完整合规 → 你审 → 派单链路。
        </p>
      </section>
    </div>
  );
}
