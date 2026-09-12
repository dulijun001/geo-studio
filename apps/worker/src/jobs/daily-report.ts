/**
 * Daily report job.
 *
 * Triggered by pg-boss schedule (09:00 Asia/Shanghai every day) — see index.ts.
 * Per-tenant fan-out:
 *   1. List active tenants
 *   2. For each, compute yesterday's KPIs
 *   3. Find owner/admin emails (tenant_memberships → auth.users.email)
 *   4. Render HTML report → sendMail
 *
 * Each tenant gets one email summarizing the previous calendar day, so the
 * recipient can read it over morning coffee instead of clicking dashboards.
 */
import {
  computeCitationInsights,
  type PublishedRowInput,
  type SnapshotRowInput,
} from '@geo/geo-core';
import { getServiceClient } from '../lib/supabase';
import { sendMail } from '../lib/mailer';
import { notifyWeCom } from '../lib/wecom';

export type DailyReportJob = {
  /** Optional override for "yesterday" — useful for re-running a missed day. */
  for_date?: string;
};

type Kpis = {
  date: string;
  published_yesterday: number;
  pending_compliance: number;
  ready_to_dispatch: number;
  conversions_yesterday: number;
  overdue_tasks: number;
  /** P1-4 (docs/11) 发布→被引回路:每平台累计发布数 vs 被 AI 引擎引用数。 */
  platform_loop: PlatformLoop[];
  /** P1-3 v0 (docs/11) 时效候选:发布 >45 天且未被引的头条文,建议安排员工更新。 */
  stale_uncited: { count: number; examples: string[] };
  /** P2 v0 (docs/11) AI 答案污染告警:近 7 天追踪答案引用了投诉/行政处罚类风险源。 */
  pollution_alerts: Array<{ question: string; domain: string }>;
  /** P1-2 (docs/11) LLM 调用失败告警:近 24h variant 生成失败次数 + 最近原因。
   *  方舟 4 个月内 4 次欠费停产,每次都数天后才发现 — 现在欠费次日早报必报。 */
  llm_failures: { count: number; latest_reason: string | null };
  /** D66(docs/08 断点1)追踪 → 选题:把追踪结果按「我们在答案里处在什么位置」分档,
   *  直接给出该补什么内容,而不是让老板每周肉眼看 SOV 表自己想。 */
  weak_questions: WeakQuestions;
  /** D69:待审合规的**积压年龄**。光报一个「待审 36」看不出严重性——实际最老的
   *  已经压了 7 周。合规人审是 D5 第三道门,不能也不该自动化,但至少要让它显形。 */
  pending_age: { count: number; oldest_days: number; over_14d: number };
};

/**
 * 追踪过的题按表现分四档。
 * 档位是按「离成交有多远」排的:被竞品独占 > 谁都没提 > 提了没进推荐位 > 已上榜。
 */
export type WeakQuestions = {
  tracked: number;
  /** 答案里只有竞品、没有我们 —— 最该补内容,而且知道补什么 */
  rival_only: Array<{ text: string; rivals: number }>;
  /** 答案里谁都没提机构(多半是纯知识题,D44 说这类本来就不产生机构榜) */
  nobody: number;
  /** 提到我们了,但没进任何编号推荐位 —— 从「被提到」到「被推荐」是真正的瓶颈 */
  mentioned_unranked: number;
  /** 已经进推荐位 */
  ranked: number;
};

type PlatformLoop = { platform: string; published: number; cited: number };

export async function handleDailyReport(data: DailyReportJob = {}): Promise<void> {
  const client = getServiceClient();

  const reportDate = data.for_date
    ? new Date(data.for_date)
    : new Date(Date.now() - 24 * 3600 * 1000);
  reportDate.setHours(0, 0, 0, 0);
  const dayStart = reportDate.toISOString();
  const dayEnd = new Date(reportDate.getTime() + 24 * 3600 * 1000).toISOString();

  const { data: tenants } = await client
    .from('tenants')
    .select('id, name, slug')
    .is('deleted_at', null);
  if (!tenants?.length) {
    console.log('[daily-report] no tenants');
    return;
  }

  for (const t of tenants as Array<{ id: string; name: string; slug: string }>) {
    const kpis = await computeKpis(t.id, dayStart, dayEnd);
    const recipients = await findRecipients(t.id);
    if (recipients.length === 0) {
      console.log(`[daily-report] tenant=${t.slug} no owner/admin recipients, skip`);
      continue;
    }
    const html = renderHtml(t.name, t.slug, kpis);
    const text = renderText(t.name, kpis);

    // C4 (2026-09-01):把"会咬人"的两类告警推企业微信 —— 邮件出口是死的(SMTP 未配),
    // 这是唯一真正触达手机的通道。只在有事时推,不做每日刷屏。
    const alerts: string[] = [];
    if (kpis.llm_failures.count > 0) {
      alerts.push(
        `⚠️ 近 24h LLM 生成失败 ${kpis.llm_failures.count} 次` +
          (kpis.llm_failures.latest_reason ? `\n> 最近原因: ${kpis.llm_failures.latest_reason}` : ''),
      );
    }
    if (kpis.pollution_alerts.length > 0) {
      alerts.push(
        `🩸 AI 答案污染风险 ${kpis.pollution_alerts.length} 条\n` +
          kpis.pollution_alerts
            .slice(0, 3)
            .map((p) => `> ${p.question} ← ${p.domain}`)
            .join('\n'),
      );
    }
    if (alerts.length > 0) {
      await notifyWeCom(`${t.name} · GEO 告警 ${kpis.date}`, alerts.join('\n\n'));
    }

    for (const to of recipients) {
      const r = await sendMail({
        to,
        subject: `${t.name} · GEO 早报 ${kpis.date}`,
        html,
        text,
      });
      console.log(`[daily-report] tenant=${t.slug} to=${to} delivered=${r.delivered}`);
    }

    await client.from('audit_logs').insert({
      tenant_id: t.id,
      action: 'report.daily_sent',
      target_type: 'tenant',
      target_id: t.id,
      payload: { date: kpis.date, recipients: recipients.length, kpis },
    });
  }
}

async function computeKpis(tenantId: string, dayStart: string, dayEnd: string): Promise<Kpis> {
  const client = getServiceClient();
  const dateLabel = new Date(dayStart).toLocaleDateString('zh-CN');

  const overdueDeadline = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [pubRes, complRes, readyRes, convRes, overdueRes] = await Promise.all([
    client
      .from('publish_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .gte('published_at', dayStart)
      .lt('published_at', dayEnd),
    client
      .from('content_variants')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('compliance_status', 'pending')
      .is('deleted_at', null),
    client
      .from('content_variants')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('compliance_status', ['auto_approved', 'manual_approved'])
      .is('deleted_at', null),
    client
      .from('conversion_events')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('stage_at', dayStart)
      .lt('stage_at', dayEnd),
    client
      .from('publish_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'dispatched'])
      .lt('created_at', overdueDeadline)
      .is('deleted_at', null),
  ]);

  return {
    date: dateLabel,
    published_yesterday: pubRes.count ?? 0,
    pending_compliance: complRes.count ?? 0,
    ready_to_dispatch: readyRes.count ?? 0,
    conversions_yesterday: convRes.count ?? 0,
    overdue_tasks: overdueRes.count ?? 0,
    ...(await computeCitationInsightsForReport(tenantId)),
    llm_failures: await computeLlmFailures(tenantId),
    weak_questions: await computeWeakQuestions(tenantId),
    pending_age: await computePendingAge(tenantId),
  };
}

/** P1-2 — 近 24h LLM 生成失败(audit_logs),欠费/限流当天可见。 */
async function computeLlmFailures(
  tenantId: string,
): Promise<{ count: number; latest_reason: string | null }> {
  const client = getServiceClient();
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, count } = await client
      .from('audit_logs')
      .select('payload', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('action', 'content.variant_generate_failed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    const latest = (data?.[0]?.payload as { reason?: string } | null)?.reason ?? null;
    return { count: count ?? 0, latest_reason: latest };
  } catch (err) {
    console.error('[daily-report] llm failure stats failed:', err);
    return { count: 0, latest_reason: null };
  }
}

/**
 * P1-4 (docs/11,2026-07-03) — 发布→被引回路。
 *
 * 把「哪个平台的内容真的被 AI 引擎引用了」变成每天可见的常态指标,
 * 替代一次性人工分析。首测结果(songshu):头条 130 发/14 引(10.8%),
 * 知乎 93 发/0 引 — 且豆包全部引用池里 zhihu.com 域名出现 0 次(结构性
 * 不引用,非内容质量问题)。平台配比是否调整由运营拍板,本回路只负责
 * 让数字每天出现在早报里。
 *
 * 匹配方式:文章数字 ID(≥9 位数字串,躲开 8 位日期串)交叉,
 * 不做 URL 字符串精确匹配 — 同一篇头条文被引时是 m.toutiao.com 移动版
 * 链接,域名路径都不同,只有 ID 稳定(2026-07-03 踩过:URL 精确匹配得 0,
 * ID 匹配得 14)。全内存计算,~200 行量级。
 */
async function computeCitationInsightsForReport(tenantId: string): Promise<{
  platform_loop: PlatformLoop[];
  stale_uncited: { count: number; examples: string[] };
  pollution_alerts: Array<{ question: string; domain: string }>;
}> {
  const client = getServiceClient();
  const empty = { platform_loop: [], stale_uncited: { count: 0, examples: [] }, pollution_alerts: [] };
  try {
    const { published, snapshots } = await fetchInsightRows(client, tenantId);
    const insights = computeCitationInsights({ published, snapshots, maxStaleExamples: 3 });

    // 污染告警:question_id → 原题文本(去重后通常 0-3 条)
    const pollution_alerts: Array<{ question: string; domain: string }> = [];
    if (insights.pollution.length > 0) {
      const qids = [...new Set(insights.pollution.map((p) => p.question_id))];
      const { data: qRows } = await client.from('questions').select('id, text').in('id', qids);
      const qText = new Map((qRows ?? []).map((q) => [q.id as string, q.text as string]));
      for (const p of insights.pollution) {
        pollution_alerts.push({ question: qText.get(p.question_id) ?? p.question_id, domain: p.domain_label });
      }
    }

    return {
      platform_loop: insights.platform_loop,
      stale_uncited: {
        count: insights.stale_uncited.count,
        examples: insights.stale_uncited.examples.map((e) => e.title),
      },
      pollution_alerts,
    };
  } catch (err) {
    // best-effort:洞察统计失败不影响早报其余部分
    console.error('[daily-report] citation insights failed:', err);
    return empty;
  }
}

/** 拉取回路计算的两组行 — web 回路看板用同一形状(计算在 @geo/geo-core 纯函数)。 */
export async function fetchInsightRows(
  client: ReturnType<typeof getServiceClient>,
  tenantId: string,
): Promise<{ published: PublishedRowInput[]; snapshots: SnapshotRowInput[] }> {
  const [pubRes, snapRes] = await Promise.all([
    client
      .from('publish_tasks')
      .select('published_url, published_at, content_variants!inner(platform, title)')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .not('published_url', 'is', null)
      .is('deleted_at', null),
    client
      .from('geo_snapshots')
      .select('citation_urls, question_id, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'done')
      .not('citation_urls', 'is', null),
  ]);
  const published: PublishedRowInput[] = ((pubRes.data ?? []) as Array<{
    published_url: string;
    published_at: string | null;
    content_variants: { platform: string; title: string } | { platform: string; title: string }[];
  }>).map((row) => {
    const cv = Array.isArray(row.content_variants) ? row.content_variants[0] : row.content_variants;
    return {
      published_url: row.published_url,
      published_at: row.published_at,
      platform: cv?.platform ?? 'unknown',
      title: cv?.title ?? null,
    };
  });
  const snapshots = (snapRes.data ?? []) as SnapshotRowInput[];
  return { published, snapshots };
}

/**
 * docs/08 断点 1 落地:追踪 → 选题。
 *
 * 数据源是 `geo_snapshots.meta.brand_scan`(D66),不是 `citations` 子表 —— 后者是二次
 * insert、失败被吞,实测 100 条 done 快照里 12 条一行都没有,拿它算「从没被提及」会
 * 把已经排第 1 的题报成零曝光(修复前这个查询报 27 道零提及,修完真实只有 2 道)。
 */
export /** 待审合规的积压年龄(D69)。只读,不改任何状态。 */
async function computePendingAge(tenantId: string): Promise<Kpis['pending_age']> {
  const client = getServiceClient();
  const { data } = await client
    .from('content_variants')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .eq('compliance_status', 'pending')
    .is('deleted_at', null)
    .limit(1000);
  const rows = data ?? [];
  if (rows.length === 0) return { count: 0, oldest_days: 0, over_14d: 0 };
  const now = Date.now();
  const ages = rows.map((r) => Math.floor((now - new Date(r.created_at as string).getTime()) / 86_400_000));
  return {
    count: rows.length,
    oldest_days: Math.max(...ages),
    over_14d: ages.filter((d) => d > 14).length,
  };
}

export async function computeWeakQuestions(tenantId: string): Promise<WeakQuestions> {
  const client = getServiceClient();
  const { data } = await client
    .from('geo_snapshots')
    .select('question_id, meta')
    .eq('tenant_id', tenantId)
    .eq('status', 'done')
    .limit(2000);

  type Agg = { mentioned: number; ranked: number; rivals: number };
  const byQ = new Map<string, Agg>();
  for (const row of data ?? []) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const bs = (meta.brand_scan ?? {}) as Record<string, number>;
    const hasRank = meta.brand_rank != null;
    const qid = row.question_id as string;
    const cur = byQ.get(qid) ?? { mentioned: 0, ranked: 0, rivals: 0 };
    if ((bs.brand ?? 0) > 0) cur.mentioned += 1;
    if (hasRank) cur.ranked += 1;
    cur.rivals = Math.max(cur.rivals, bs.competitor ?? 0);
    byQ.set(qid, cur);
  }

  const rivalOnlyIds = [...byQ.entries()]
    .filter(([, a]) => a.mentioned === 0 && a.rivals > 0)
    .sort((a, b) => b[1].rivals - a[1].rivals)
    .slice(0, 5);

  let nobody = 0;
  let unranked = 0;
  let ranked = 0;
  for (const [, a] of byQ) {
    if (a.ranked > 0) ranked += 1;
    else if (a.mentioned > 0) unranked += 1;
    else if (a.rivals === 0) nobody += 1;
  }

  const texts = new Map<string, string>();
  if (rivalOnlyIds.length > 0) {
    const { data: qs } = await client
      .from('questions')
      .select('id, text')
      .in('id', rivalOnlyIds.map(([id]) => id));
    for (const q of qs ?? []) texts.set(q.id as string, q.text as string);
  }

  return {
    tracked: byQ.size,
    rival_only: rivalOnlyIds.map(([id, a]) => ({ text: texts.get(id) ?? id, rivals: a.rivals })),
    nobody,
    mentioned_unranked: unranked,
    ranked,
  };
}

async function findRecipients(tenantId: string): Promise<string[]> {
  const client = getServiceClient();
  const { data: members } = await client
    .from('tenant_memberships')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .in('role', ['owner', 'admin']);
  if (!members?.length) return [];

  const emails: string[] = [];
  for (const m of members as Array<{ user_id: string }>) {
    const { data: u } = await client.auth.admin.getUserById(m.user_id);
    const email = u?.user?.email;
    if (email) emails.push(email);
  }
  return emails;
}

function renderHtml(tenantName: string, tenantSlug: string, kpis: Kpis): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const link = (path: string) => `${appUrl}/t/${tenantSlug}${path}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${tenantName} · GEO 早报</title></head>
<body style="font-family:-apple-system,'PingFang SC',sans-serif;background:#f6f7fa;margin:0;padding:24px;color:#1a1d29">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:28px;border:1px solid #e6e8ee">
    <p style="font-size:11px;letter-spacing:1px;color:#7d8594;text-transform:uppercase;margin:0 0 6px">GEO Studio · 每日早报</p>
    <h1 style="font-size:22px;margin:0 0 4px;font-weight:600">${tenantName}</h1>
    <p style="font-size:13px;color:#7d8594;margin:0 0 20px">${kpis.date}</p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        ${kpiCell('昨日发布', kpis.published_yesterday)}
        ${kpiCell('转化事件', kpis.conversions_yesterday)}
      </tr>
      <tr>
        ${kpiCell('待审合规', kpis.pending_compliance)}
        ${kpiCell('可派变体', kpis.ready_to_dispatch)}
      </tr>
    </table>

    ${
      kpis.overdue_tasks > 0
        ? `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:12px 14px;margin-bottom:18px;color:#9f1239;font-size:14px">⚠ ${kpis.overdue_tasks} 条任务超过 24 小时未回填发布链接,记得跟进员工。</div>`
        : ''
    }

    ${
      kpis.llm_failures.count > 0
        ? `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:12px 14px;margin-bottom:18px;color:#9f1239;font-size:13px">
          <strong>🔴 LLM 生成失败 ${kpis.llm_failures.count} 次(近 24h)</strong>${
            kpis.llm_failures.latest_reason?.match(/[Oo]verdue|欠费/)
              ? ' — <strong>疑似火山方舟欠费,请立即充值</strong>'
              : ''
          }<br><span style="color:#be123c;font-size:12px">最近原因:${(kpis.llm_failures.latest_reason ?? '未知').slice(0, 100)}</span></div>`
        : ''
    }

    ${
      kpis.pollution_alerts.length > 0
        ? `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:12px 14px;margin-bottom:18px;color:#9f1239;font-size:13px">
          <strong>🚨 AI 答案污染告警(近 7 天)</strong><br>
          ${kpis.pollution_alerts.map((a) => `「${a.question}」的 AI 答案引用了 <strong>${a.domain}</strong>`).join('<br>')}
          <br><span style="color:#be123c">可能是同名机构的负面被算到本品牌头上(实体混淆),建议核实并加强官网实体信息锚定。</span></div>`
        : ''
    }

    ${renderPlatformLoop(kpis.platform_loop)}

    ${
      kpis.stale_uncited.count > 0
        ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:18px;color:#92400e;font-size:13px">
          ⏳ <strong>${kpis.stale_uncited.count} 篇</strong>头条文发布超 45 天仍未被 AI 引用,建议安排员工更新内容刷新时效信号。如:${kpis.stale_uncited.examples.map((t) => `「${t.slice(0, 20)}…」`).join('、')}</div>`
        : ''
    }

    <a href="${link('')}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;font-weight:500;text-decoration:none;font-size:14px">打开 GEO Studio →</a>

    <hr style="border:none;border-top:1px solid #e6e8ee;margin:24px 0">
    <p style="font-size:11px;color:#9aa0ad;line-height:1.6;margin:0">
      这封邮件每天 09:00 自动发给所有 owner/admin。<br>
      <a href="${link('/settings')}" style="color:#7d8594">设置</a> · <a href="${link('/help')}" style="color:#7d8594">使用手册</a>
    </p>
  </div>
</body>
</html>`;
}

/** P1-4 发布→被引回路表(累计,基于本租户追踪快照的引用源)。 */
function renderPlatformLoop(loop: PlatformLoop[]): string {
  if (!loop.length) return '';
  const PLATFORM_LABEL: Record<string, string> = {
    toutiao_article: '今日头条',
    zhihu: '知乎',
    wechat_mp: '公众号',
    xiaohongshu: '小红书',
    douyin_script: '抖音',
    baijiahao: '百家号',
    souhu: '搜狐号',
  };
  const rows = loop
    .map((p) => {
      const rate = p.published > 0 ? `${((100 * p.cited) / p.published).toFixed(1)}%` : '—';
      const zero = p.cited === 0 && p.published >= 20;
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eef0f4;font-size:13px">${PLATFORM_LABEL[p.platform] ?? p.platform}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eef0f4;font-size:13px;text-align:right">${p.published}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eef0f4;font-size:13px;text-align:right;${zero ? 'color:#9f1239;font-weight:600' : ''}">${p.cited}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eef0f4;font-size:13px;text-align:right;${zero ? 'color:#9f1239' : 'color:#7d8594'}">${rate}</td>
      </tr>`;
    })
    .join('');
  return `<div style="margin-bottom:18px">
    <p style="font-size:12px;color:#7d8594;margin:0 0 6px;letter-spacing:0.5px">发布 → AI 引用回路(累计)</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e6e8ee;border-radius:8px">
      <tr>
        <th style="padding:6px 10px;font-size:11px;color:#7d8594;text-align:left;border-bottom:1px solid #e6e8ee">平台</th>
        <th style="padding:6px 10px;font-size:11px;color:#7d8594;text-align:right;border-bottom:1px solid #e6e8ee">已发布</th>
        <th style="padding:6px 10px;font-size:11px;color:#7d8594;text-align:right;border-bottom:1px solid #e6e8ee">被引用</th>
        <th style="padding:6px 10px;font-size:11px;color:#7d8594;text-align:right;border-bottom:1px solid #e6e8ee">引用率</th>
      </tr>
      ${rows}
    </table>
  </div>`;
}

function kpiCell(label: string, value: number): string {
  return `<td style="width:50%;padding:14px;border:1px solid #e6e8ee;border-radius:8px" valign="top">
    <p style="font-size:11px;color:#7d8594;margin:0 0 4px;letter-spacing:0.5px">${label}</p>
    <p style="font-size:28px;margin:0;font-weight:600;color:#1a1d29">${value}</p>
  </td>`;
}

function renderText(tenantName: string, kpis: Kpis): string {
  return [
    `${tenantName} · GEO 早报 · ${kpis.date}`,
    '',
    `昨日发布:${kpis.published_yesterday}`,
    `转化事件:${kpis.conversions_yesterday}`,
    `待审合规:${kpis.pending_compliance}`,
    `可派变体:${kpis.ready_to_dispatch}`,
    kpis.overdue_tasks > 0 ? `⚠ 逾期任务 ${kpis.overdue_tasks} 条` : '',
    kpis.platform_loop.length > 0
      ? `\n发布→AI引用回路(累计):\n${kpis.platform_loop
          .map((p) => `  ${p.platform}: 发 ${p.published} / 引 ${p.cited}`)
          .join('\n')}`
      : '',
    kpis.pollution_alerts.length > 0
      ? `\n🚨 AI答案污染告警:\n${kpis.pollution_alerts.map((a) => `  「${a.question}」引用了 ${a.domain}`).join('\n')}`
      : '',
    kpis.stale_uncited.count > 0 ? `⏳ ${kpis.stale_uncited.count} 篇发布>45天未被引,建议更新` : '',
    kpis.llm_failures.count > 0
      ? `🔴 LLM 生成失败 ${kpis.llm_failures.count} 次(近24h),最近原因:${(kpis.llm_failures.latest_reason ?? '未知').slice(0, 80)}`
      : '',
    kpis.pending_age.over_14d > 0
      ? `⏳ 待审合规 ${kpis.pending_age.count} 条,其中 ${kpis.pending_age.over_14d} 条压了 14 天以上,最老 ${kpis.pending_age.oldest_days} 天 — 合规人审只能你来`
      : '',
    renderWeakQuestions(kpis.weak_questions),
  ]
    .filter(Boolean)
    .join('\n');
}

/** 追踪 → 选题(docs/08 断点1)。没追踪过任何题就整段不出,别在早报里留空壳。 */
export function renderWeakQuestions(w: WeakQuestions): string {
  if (w.tracked === 0) return '';
  const lines = [
    '',
    `该写什么(追踪过 ${w.tracked} 道题):`,
    `  🟢 已进推荐位 ${w.ranked}`,
    `  🟡 提到了但没进推荐位 ${w.mentioned_unranked}  ← 从「被提到」到「被推荐」是瓶颈`,
    `  ⚪ 答案里谁都没提机构 ${w.nobody}(多为纯知识题,D44 说本就不产生机构榜)`,
  ];
  if (w.rival_only.length > 0) {
    lines.push(`  🔴 只有竞品没有我们 ${w.rival_only.length} 道 — 最该补内容:`);
    for (const r of w.rival_only) lines.push(`      「${r.text}」(答案里出现 ${r.rivals} 家竞品)`);
  } else {
    lines.push('  🔴 只有竞品没有我们:0 道');
  }
  return lines.join('\n');
}
