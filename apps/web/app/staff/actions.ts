'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { clearStaffSession } from '@/lib/staff-session';
import { requireStaff } from '@/lib/staff';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { enqueueRegenerate } from '@/lib/discoverability/enqueue';

export async function logoutStaff(): Promise<void> {
  clearStaffSession();
  redirect('/staff/login');
}

/**
 * Record that the staff member has published the task.
 * Input: the URL where the content was posted (for later GEO attribution).
 */
export async function markTaskPublished(taskId: string, urlRaw: string): Promise<void> {
  const ctx = await requireStaff();
  const url = urlRaw.trim();

  if (!/^https?:\/\//i.test(url)) {
    throw new Error('请粘贴完整链接(以 http 或 https 开头)');
  }

  const client = getSupabaseServiceClient();

  // Scope update to (task_id, staff_id, tenant_id) — belt & suspenders against tampering.
  const { data: task, error: tErr } = await client
    .from('publish_tasks')
    .select('id, staff_account_id, tenant_id, status, variant_id')
    .eq('id', taskId)
    .single();
  if (tErr || !task) throw new Error('任务不存在');
  if (task.staff_account_id !== ctx.staff_id) throw new Error('这不是分派给你的任务');
  if (task.tenant_id !== ctx.tenant_id) throw new Error('租户不匹配');
  if (task.status === 'published') return; // idempotent

  const { error: upErr } = await client
    .from('publish_tasks')
    .update({
      status: 'published',
      published_url: url,
      published_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (upErr) throw new Error(`打卡失败: ${upErr.message}`);

  await client.from('audit_logs').insert({
    tenant_id: ctx.tenant_id,
    action: 'publish.task_published',
    target_type: 'publish_task',
    target_id: taskId,
    payload: { staff_id: ctx.staff_id, url },
  });

  // V1.7 ↔ V1.8 wiring (D14/D17, ADR 005): the discoverability worker reads
  // content_items WHERE status='published'. Without this transition the
  // articles array is forever empty and llms.txt / feed / sitemap never list
  // any of our content. We flip on FIRST published task per content_item
  // (idempotent) — waiting for "all platforms posted" delays surfacing for
  // weeks and matters less than getting visibility into AI engines fast.
  const { data: variantRow } = await client
    .from('content_variants')
    .select('content_item_id')
    .eq('id', task.variant_id as string)
    .single<{ content_item_id: string }>();
  if (variantRow?.content_item_id) {
    const { data: itemRow } = await client
      .from('content_items')
      .select('id, status')
      .eq('id', variantRow.content_item_id)
      .single<{ id: string; status: string }>();
    if (itemRow && itemRow.status !== 'published') {
      await client
        .from('content_items')
        .update({ status: 'published' })
        .eq('id', itemRow.id);
      // Async — don't block staff UX on artifact regen latency.
      try {
        await enqueueRegenerate(ctx.tenant_id);
      } catch (e) {
        console.error('[markTaskPublished] enqueueRegenerate failed:', e);
      }
    }
  }

  revalidatePath('/staff');
}

export async function markTaskSkipped(taskId: string, reasonRaw: string): Promise<void> {
  const ctx = await requireStaff();
  const reason = reasonRaw.trim().slice(0, 200);
  if (reason.length < 2) throw new Error('请填写跳过原因(2 字以上)');

  const client = getSupabaseServiceClient();

  const { data: task, error: tErr } = await client
    .from('publish_tasks')
    .select('id, staff_account_id, tenant_id, status')
    .eq('id', taskId)
    .single();
  if (tErr || !task) throw new Error('任务不存在');
  if (task.staff_account_id !== ctx.staff_id) throw new Error('这不是分派给你的任务');
  if (task.tenant_id !== ctx.tenant_id) throw new Error('租户不匹配');
  if (task.status === 'published') throw new Error('该任务已发布,不能跳过');

  const { error: upErr } = await client
    .from('publish_tasks')
    .update({ status: 'skipped', skip_reason: reason })
    .eq('id', taskId);
  if (upErr) throw new Error(`跳过失败: ${upErr.message}`);

  await client.from('audit_logs').insert({
    tenant_id: ctx.tenant_id,
    action: 'publish.task_skipped',
    target_type: 'publish_task',
    target_id: taskId,
    payload: { staff_id: ctx.staff_id, reason },
  });

  revalidatePath('/staff');
}
