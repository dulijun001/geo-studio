/**
 * 每日企业微信派单与打卡汇报 (谁发了、谁没发、待发清单)
 */
import { getServiceClient } from '../lib/supabase';
import { notifyPublishProgressDigest, notifyTodayPublishPlan } from '../lib/wecom-notifier';

export const STAFF_BACKLOG_DIGEST_JOB = 'ops.staff_backlog_digest';
export const DAILY_PUBLISH_PLAN_JOB = 'ops.daily_publish_plan';

/**
 * 进度汇报：谁发了、谁没发 (午间 12:00 / 傍晚 17:30)
 */
export async function handleStaffBacklogDigest(
  _data: { titlePrefix?: string } = {},
): Promise<void> {
  const client = getServiceClient();

  const { data: tenants } = await client
    .from('tenants')
    .select('id, name')
    .is('deleted_at', null);
  if (!tenants?.length) return;

  for (const t of tenants as Array<{ id: string; name: string }>) {
    try {
      await notifyPublishProgressDigest(t.id, { titlePrefix: _data?.titlePrefix });
      console.log(`[staff-progress-digest] tenant=${t.name} progress pushed to WeCom`);
    } catch (err) {
      console.error(`[staff-progress-digest] tenant=${t.name} failed:`, err);
    }
  }
}

/**
 * 晨间任务推送：今日待发任务清单 (每天 09:30)
 */
export async function handleDailyMorningPublishPlan(): Promise<void> {
  const client = getServiceClient();

  const { data: tenants } = await client
    .from('tenants')
    .select('id, name')
    .is('deleted_at', null);
  if (!tenants?.length) return;

  for (const t of tenants as Array<{ id: string; name: string }>) {
    try {
      await notifyTodayPublishPlan(t.id);
      console.log(`[daily-publish-plan] tenant=${t.name} morning plan pushed to WeCom`);
    } catch (err) {
      console.error(`[daily-publish-plan] tenant=${t.name} failed:`, err);
    }
  }
}
