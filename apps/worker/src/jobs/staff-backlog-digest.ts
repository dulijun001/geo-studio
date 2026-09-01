/**
 * G1 轻量版(2026-09-01):每日把"派了没发"的积压清单推给管理员企业微信。
 *
 * 背景:内容出货率仅 36%,64% 派单内容烂在队列(僵尸核心号 6 周 0 发)。真正
 * 触达 40 个员工需要企微 userid 映射(待建);这个轻量版先让管理员每天看见
 * "谁压了多少、压了多久、谁快到 14 天回收线",把执行侧的黑箱先照亮,便于人工催办。
 *
 * 数据:publish_tasks.status='dispatched'(已派未发)按 staff_account 聚合。
 * 复用 getServiceClient + notifyWeCom,不引新依赖。
 */
import { getServiceClient } from '../lib/supabase';
import { notifyWeCom } from '../lib/wecom';

export const STAFF_BACKLOG_DIGEST_JOB = 'ops.staff_backlog_digest';

// D43/auto-dispatch-timeout:派单超 14 天未发自动回收。>=10 天的先预警。
const EXPIRY_DAYS = 14;
const WARN_DAYS = 10;

export async function handleStaffBacklogDigest(_data: Record<string, never> = {}): Promise<void> {
  const client = getServiceClient();

  const { data: tenants } = await client
    .from('tenants')
    .select('id, name')
    .is('deleted_at', null);
  if (!tenants?.length) return;

  for (const t of tenants as Array<{ id: string; name: string }>) {
    const { data: tasks, error } = await client
      .from('publish_tasks')
      .select('staff_account_id, dispatched_at')
      .eq('tenant_id', t.id)
      .eq('status', 'dispatched')
      .is('deleted_at', null);
    if (error) {
      console.error(`[staff-backlog] tenant=${t.name} query failed:`, error.message);
      continue;
    }
    if (!tasks?.length) {
      // 无积压也报一句,让"今天清零"这件好事可见(正反馈,不是只在坏消息时出声)。
      await notifyWeCom(`${t.name} · 待发积压 0`, '✅ 当前没有派了没发的内容,队列清空。');
      continue;
    }

    // 取员工名字(一次查完,避免逐条查库)
    const staffIds = [...new Set(tasks.map((x) => x.staff_account_id).filter(Boolean))];
    const { data: staff } = await client
      .from('staff_accounts')
      .select('id, real_name')
      .in('id', staffIds);
    const nameOf = new Map((staff ?? []).map((s) => [s.id, s.real_name as string]));

    const now = Date.now();
    const ageDays = (iso: string | null): number =>
      iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : 0;

    // 按员工聚合:条数 + 最老那条的天数
    type Row = { name: string; count: number; oldest: number };
    const byStaff = new Map<string, Row>();
    for (const task of tasks) {
      const key = task.staff_account_id ?? 'unknown';
      const name = nameOf.get(key) ?? '(未知号)';
      const age = ageDays(task.dispatched_at);
      const row = byStaff.get(key) ?? { name, count: 0, oldest: 0 };
      row.count += 1;
      row.oldest = Math.max(row.oldest, age);
      byStaff.set(key, row);
    }

    const rows = [...byStaff.values()].sort((a, b) => b.oldest - a.oldest || b.count - a.count);
    const total = tasks.length;
    const nearExpiry = tasks.filter((x) => ageDays(x.dispatched_at) >= WARN_DAYS).length;

    const lines = rows.map((r) => {
      const flag = r.oldest >= WARN_DAYS ? ' 🔴' : '';
      const expireHint = r.oldest >= WARN_DAYS ? `,最老 ${r.oldest} 天(${EXPIRY_DAYS}天回收)` : '';
      return `> ${r.name}:${r.count} 条${expireHint}${flag}`;
    });

    const body =
      `共 ${total} 条派了没发` +
      (nearExpiry > 0 ? `,其中 ${nearExpiry} 条已超 ${WARN_DAYS} 天(快被回收)` : '') +
      `\n${lines.join('\n')}`;
    await notifyWeCom(`${t.name} · 待发积压 ${total}`, body);
    console.log(`[staff-backlog] tenant=${t.name} pushed: total=${total} nearExpiry=${nearExpiry}`);
  }
}
