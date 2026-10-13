import { getServiceClient } from './supabase';
import { notifyWeCom } from './wecom';

const STAFF_LOGIN_URL = 'https://geo.dulijun.ccwu.cc/staff';
const STAFF_PASSCODE = '88888888';

function formatPlatformName(platform?: string | null): string {
  if (!platform) return '今日头条';
  if (platform === 'toutiao' || platform === 'toutiao_article') return '今日头条';
  if (platform === 'zhihu') return '知乎';
  if (platform === 'douyin') return '抖音';
  if (platform === 'xiaohongshu') return '小红书';
  return platform;
}

/**
 * 1. 有新派单时触发：推送到企业微信群
 */
export async function notifyNewDispatchedTasks(
  tenantId: string,
  taskIds: string[],
): Promise<boolean> {
  if (!taskIds.length) return false;
  const client = getServiceClient();

  const { data: tenant } = await client
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .single();
  const tenantName = tenant?.name || '松鼠口腔';

  // 查询新派发的任务详情
  const { data: tasks, error: tasksErr } = await client
    .from('publish_tasks')
    .select('id, staff_account_id, variant_id, scheduled_at, dispatched_at')
    .in('id', taskIds);

  if (tasksErr || !tasks?.length) {
    console.error('[wecom-notifier] query new tasks failed:', tasksErr?.message);
    return false;
  }

  // 获取关联的员工与变体
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

  // 按员工分组统计
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

  const title = `📢 【${tenantName}】今日新派单通知`;
  return await notifyWeCom(title, lines.join('\n'));
}

/**
 * 2. 派单打卡进度汇报（谁发了、谁没发）：推送到企业微信群
 */
export async function notifyPublishProgressDigest(
  tenantId: string,
  options?: { titlePrefix?: string },
): Promise<boolean> {
  const client = getServiceClient();

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

  // 查询所有非跳过的任务
  const { data: tasks, error: tasksErr } = await client
    .from('publish_tasks')
    .select('id, status, staff_account_id, variant_id, dispatched_at, scheduled_at, published_url')
    .eq('tenant_id', tenantId)
    .neq('status', 'skipped')
    .is('deleted_at', null);

  if (tasksErr || !tasks) {
    console.error('[wecom-notifier] query tasks failed:', tasksErr?.message);
    return false;
  }

  const publishedTasks = tasks.filter((t) => t.status === 'published');
  const pendingTasks = tasks.filter((t) => t.status === 'dispatched' || t.status === 'pending');

  const variantIds = Array.from(new Set(pendingTasks.map((t) => t.variant_id).filter(Boolean)));
  const { data: variants } =
    variantIds.length > 0
      ? await client.from('content_variants').select('id, title, platform').in('id', variantIds)
      : { data: [] };
  const variantMap = new Map((variants || []).map((v) => [v.id, v]));

  // 统计谁发了
  const publishedByStaff = new Map<string, number>();
  for (const t of publishedTasks) {
    const sId = t.staff_account_id || 'unknown';
    publishedByStaff.set(sId, (publishedByStaff.get(sId) || 0) + 1);
  }

  // 统计谁没发
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

  const title = options?.titlePrefix
    ? `${options.titlePrefix} · 【${tenantName}】发稿打卡进度`
    : `📊 【${tenantName}】发稿打卡进度汇报`;

  return await notifyWeCom(title, lines.join('\n'));
}

/**
 * 3. 每日早间推送：今日待发任务清单（每天把要发的推送到群里）
 */
export async function notifyTodayPublishPlan(tenantId: string): Promise<boolean> {
  const client = getServiceClient();

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

  // 查询当前状态为待发（dispatched 或 pending）的任务
  const { data: tasks, error: tasksErr } = await client
    .from('publish_tasks')
    .select('id, status, staff_account_id, variant_id, scheduled_at')
    .eq('tenant_id', tenantId)
    .in('status', ['dispatched', 'pending'])
    .is('deleted_at', null);

  if (tasksErr || !tasks) {
    console.error('[wecom-notifier] query today tasks failed:', tasksErr?.message);
    return false;
  }

  if (tasks.length === 0) {
    return await notifyWeCom(
      `☀️ 【${tenantName}】今日发稿任务清单`,
      `> 统计时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n✅ 今日暂无待发任务（待发队列已清空）。`,
    );
  }

  const variantIds = Array.from(new Set(tasks.map((t) => t.variant_id).filter(Boolean)));
  const { data: variants } = await client
    .from('content_variants')
    .select('id, title, platform')
    .in('id', variantIds);
  const variantMap = new Map((variants || []).map((v) => [v.id, v]));

  type Item = { title: string; platform: string };
  const byStaff = new Map<string, Item[]>();
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

  const todayStr = new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const lines: string[] = [
    `> 发稿日期：${todayStr}`,
    `> 今日共计待发 **${tasks.length}** 篇，分配给 **${byStaff.size}** 位同事，请注意安排发稿：`,
    '',
  ];

  for (const [sId, list] of byStaff.entries()) {
    const name = staffNameMap.get(sId) || '员工';
    lines.push(`- **${name}**（今日待发 **${list.length}** 篇）：`);
    list.forEach((item, idx) => {
      lines.push(`  ${idx + 1}. [${item.platform}] 《${item.title}》`);
    });
  }

  lines.push('');
  lines.push(`👉 [点击进入员工打卡工作台](${STAFF_LOGIN_URL})（统一口令：\`${STAFF_PASSCODE}\`）`);
  lines.push('请各位老师于今日下午 17:00 前完成发布并回填链接打卡！');

  return await notifyWeCom(`☀️ 【${tenantName}】今日待发稿任务清单`, lines.join('\n'));
}
