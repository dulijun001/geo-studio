import { getSupabaseServiceClient } from '@/lib/supabase/service';

const STAFF_LOGIN_URL = 'https://geo.dulijun.ccwu.cc/staff';
const STAFF_PASSCODE = '88888888';

export async function sendWeComMessage(title: string, body: string): Promise<boolean> {
  const url = process.env.WECOM_WEBHOOK_URL;
  if (!url) return false;

  const content = `**${title}**\n${body}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const json = (await res.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
    if (json.errcode !== 0) {
      console.error(`[wecom-web] 推送失败: errcode=${json.errcode} ${json.errmsg ?? ''}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[wecom-web] 推送异常:', err);
    return false;
  }
}

function formatPlatformName(platform?: string | null): string {
  if (!platform) return '今日头条';
  if (platform === 'toutiao' || platform === 'toutiao_article') return '今日头条';
  if (platform === 'zhihu') return '知乎';
  if (platform === 'douyin') return '抖音';
  if (platform === 'xiaohongshu') return '小红书';
  return platform;
}

/**
 * 1. 有新派单时触发推送
 */
export async function notifyNewDispatchedTasksFromWeb(
  tenantId: string,
  taskIds: string[],
): Promise<boolean> {
  if (!taskIds.length) return false;
  const client = getSupabaseServiceClient();

  const { data: tenant } = await client
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .single();
  const tenantName = tenant?.name || '松鼠口腔';

  const { data: tasks, error: tasksErr } = await client
    .from('publish_tasks')
    .select('id, staff_account_id, variant_id, scheduled_at, dispatched_at')
    .in('id', taskIds);

  if (tasksErr || !tasks?.length) return false;

  const staffIds = Array.from(new Set(tasks.map((t) => t.staff_account_id).filter(Boolean)));
  const variantIds = Array.from(new Set(tasks.map((t) => t.variant_id).filter(Boolean)));

  const [{ data: staffList }, { data: variants }] = await Promise.all([
    staffIds.length > 0
      ? client.from('staff_accounts').select('id, real_name').in('id', staffIds)
      : Promise.resolve({ data: [] }),
    variantIds.length > 0
      ? client.from('content_variants').select('id, title, platform').in('id', variantIds)
      : Promise.resolve({ data: [] }),
  ]);

  const staffNameMap = new Map((staffList || []).map((s) => [s.id, s.real_name || '员工']));
  const variantMap = new Map((variants || []).map((v) => [v.id, v]));

  type TaskItem = { title: string; platform: string };
  const byStaff = new Map<string, TaskItem[]>();
  for (const t of tasks) {
    const sId = t.staff_account_id || 'unknown';
    const list = byStaff.get(sId) || [];
    const v = variantMap.get(t.variant_id);
    list.push({
      title: v?.title || '未命名文章',
      platform: formatPlatformName(v?.platform),
    });
    byStaff.set(sId, list);
  }

  const nowCst = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const lines: string[] = [
    `> 派发时间：${nowCst}`,
    `> 本次共派发 **${tasks.length}** 篇任务，涉及 **${byStaff.size}** 位同事：`,
    '',
  ];

  for (const [sId, list] of byStaff.entries()) {
    const name = staffNameMap.get(sId) || '员工';
    lines.push(`- **${name}**（共 **${list.length}** 篇）：`);
    list.forEach((item, idx) => {
      lines.push(`  ${idx + 1}. [${item.platform}] 《${item.title}》`);
    });
  }

  lines.push('');
  lines.push(`👉 [点击进入员工打卡工作台](${STAFF_LOGIN_URL})（统一口令：\`${STAFF_PASSCODE}\`）`);
  lines.push('请各位老师今日内完成发布并在打卡端回填链接！');

  return await sendWeComMessage(`📢 【${tenantName}】今日新派单通知`, lines.join('\n'));
}

/**
 * 2. 派单打卡进度汇报（谁发了、谁没发）
 */
export async function notifyPublishProgressDigestFromWeb(
  tenantId: string,
): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseServiceClient();

  const { data: tenant } = await client
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .single();
  const tenantName = tenant?.name || '松鼠口腔';

  const { data: staffList } = await client
    .from('staff_accounts')
    .select('id, real_name')
    .eq('tenant_id', tenantId);
  const staffNameMap = new Map((staffList || []).map((s) => [s.id, s.real_name || '员工']));

  const { data: tasks, error: tasksErr } = await client
    .from('publish_tasks')
    .select('id, status, staff_account_id, variant_id, dispatched_at, scheduled_at, published_url')
    .eq('tenant_id', tenantId)
    .neq('status', 'skipped')
    .is('deleted_at', null);

  if (tasksErr || !tasks) {
    return { success: false, message: `查询任务失败: ${tasksErr?.message}` };
  }

  const publishedTasks = tasks.filter((t) => t.status === 'published');
  const pendingTasks = tasks.filter((t) => t.status === 'dispatched' || t.status === 'pending');

  const variantIds = Array.from(new Set(pendingTasks.map((t) => t.variant_id).filter(Boolean)));
  const { data: variants } =
    variantIds.length > 0
      ? await client.from('content_variants').select('id, title, platform').in('id', variantIds)
      : { data: [] };
  const variantMap = new Map((variants || []).map((v) => [v.id, v]));

  const publishedByStaff = new Map<string, number>();
  for (const t of publishedTasks) {
    const sId = t.staff_account_id || 'unknown';
    publishedByStaff.set(sId, (publishedByStaff.get(sId) || 0) + 1);
  }

  type PendingItem = { title: string; platform: string };
  const pendingByStaff = new Map<string, PendingItem[]>();
  for (const t of pendingTasks) {
    const sId = t.staff_account_id || 'unknown';
    const list = pendingByStaff.get(sId) || [];
    const v = variantMap.get(t.variant_id);
    list.push({
      title: v?.title || '未命名文章',
      platform: formatPlatformName(v?.platform),
    });
    pendingByStaff.set(sId, list);
  }

  const total = publishedTasks.length + pendingTasks.length;
  const rate = total > 0 ? Math.round((publishedTasks.length / total) * 100) : 0;
  const nowCst = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const lines: string[] = [
    `> 统计时间：${nowCst}`,
    `> 派发总数：**${total}** 篇 ｜ 已发打卡：**${publishedTasks.length}** 篇 ｜ 完成率：**${rate}%**`,
    '',
    '### ⏳ 待发布 / 谁没发（请尽快发布打卡）：',
  ];

  if (pendingByStaff.size === 0) {
    lines.push('> ✅ 太棒了！当前待发队列已全部清空，所有派单均已完成发布打卡！');
  } else {
    for (const [sId, list] of pendingByStaff.entries()) {
      const name = staffNameMap.get(sId) || '员工';
      lines.push(`- **${name}**（待发 **${list.length}** 篇）：`);
      list.forEach((item, idx) => {
        lines.push(`  ${idx + 1}. [${item.platform}] 《${item.title}》`);
      });
    }
  }

  lines.push('');
  lines.push('### ✅ 已发布 / 谁发了（打卡先锋）：');
  const pubList = Array.from(publishedByStaff.entries()).sort((a, b) => b[1] - a[1]);
  if (pubList.length === 0) {
    lines.push('> 暂无打卡记录');
  } else {
    for (const [sId, count] of pubList) {
      const name = staffNameMap.get(sId) || '员工';
      lines.push(`- **${name}**：已发 **${count}** 篇`);
    }
  }

  lines.push('');
  lines.push(`👉 [点击进入员工打卡工作台](${STAFF_LOGIN_URL})（统一口令：\`${STAFF_PASSCODE}\`）`);

  const ok = await sendWeComMessage(
    `📊 【${tenantName}】发稿打卡进度汇报`,
    lines.join('\n'),
  );

  return {
    success: ok,
    message: ok ? '已成功推送到企业微信群！' : '企业微信推送未成功，请检查 Webhook 配置',
  };
}
