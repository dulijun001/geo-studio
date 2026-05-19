/**
 * V1.10 /daily-ops Hub — "设置" tab 内容.
 * Extracted from app/t/[slug]/settings/daily-ops/page.tsx.
 */
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { DailyOpsSettingsForm } from '../settings/daily-ops/settings-form';

type SettingsRow = {
  enabled: boolean;
  topic_count_auto: number;
  manual_slot_max: number;
  timeout_hours: number;
  weekend_skip: boolean;
  max_variants_day: number;
  notify_email: string | null;
};

export async function SettingsView({
  slug,
  tenantId,
}: {
  slug: string;
  tenantId: string;
}) {
  const service = getSupabaseServiceClient();

  const { data: settings } = await service
    .from('daily_ops_settings')
    .select(
      'enabled, topic_count_auto, manual_slot_max, timeout_hours, weekend_skip, max_variants_day, notify_email',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const initial: SettingsRow = settings ?? {
    enabled: false,
    topic_count_auto: 5,
    manual_slot_max: 2,
    timeout_hours: 6,
    weekend_skip: false,
    max_variants_day: 50,
    notify_email: null,
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        总开关 + 选题 + 超时 + 通知。手填位在「手填位」tab 编辑。
      </p>

      <DailyOpsSettingsForm tenantSlug={slug} initial={initial} />

      <section className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        <h3 className="mb-2 font-medium text-foreground">还没暴露的高级配置</h3>
        <ul className="space-y-1">
          <li>• cron 时间:固定凌晨 02:00 Asia/Shanghai(V1.11 可改)</li>
          <li>• 选题源:基于问题库 priority(V1.11 切换反馈回路 docs/08 §8)</li>
          <li>• 通知渠道:仅站内 + 邮件(V2 接企微/短信)</li>
          <li>• 派单算法:沿用 V1.5 dispatchToday — 6h 超时后绿色待你在「今日待审」点批量派</li>
        </ul>
      </section>
    </div>
  );
}
