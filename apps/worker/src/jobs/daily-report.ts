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
import { getServiceClient } from '../lib/supabase';
import { sendMail } from '../lib/mailer';

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
};

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
  ]
    .filter(Boolean)
    .join('\n');
}
