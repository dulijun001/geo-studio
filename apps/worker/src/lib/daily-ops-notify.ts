/**
 * V1.10 / docs/09 T7 — daily-ops notification (email only in V1.10).
 *
 * Called by cron #2 (advanceDraftingToAwaiting) when a run transitions to
 * awaiting_review. Sends one "今日待审" email per tenant.
 *
 * Recipient resolution:
 *   1. settings.notify_email (explicit)
 *   2. tenant_memberships owner/admin auth.users.email (fallback)
 *
 * notify_channels filter:
 *   - 'email' present → send via sendMail (V1.10)
 *   - 'in_app' present → no-op (the /today page itself is the in-app banner)
 *   - 'wecom' / 'sms' → no-op (V2)
 *
 * Failures are non-throwing — notification is best-effort, cron must not
 * stall on email failure. reportError captures for observability.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { reportError, reportEvent } from '@geo/shared';
import { sendMail } from './mailer';

type CountsLike = {
  green?: number;
  yellow?: number;
  red?: number;
  black?: number;
  total_evaluated?: number;
};

export async function notifyAwaitingReview(
  client: SupabaseClient,
  args: {
    tenant_id: string;
    run_id: string;
    run_date: string;
    counts: CountsLike;
  },
): Promise<void> {
  const { tenant_id, run_id, run_date, counts } = args;

  // 1. Load tenant + settings in parallel
  const [tenantRes, settingsRes] = await Promise.all([
    client.from('tenants').select('id, name, slug').eq('id', tenant_id).maybeSingle(),
    client
      .from('daily_ops_settings')
      .select('notify_channels, notify_email')
      .eq('tenant_id', tenant_id)
      .maybeSingle(),
  ]);

  const tenant = tenantRes.data as { id: string; name: string; slug: string } | null;
  const settings = settingsRes.data as
    | { notify_channels: string[] | null; notify_email: string | null }
    | null;

  if (!tenant) {
    reportError(new Error('tenant not found for notify'), {
      scope: 'daily-ops.notify.tenant_missing',
      tenant_id,
      extra: { run_id },
    });
    return;
  }

  const channels = settings?.notify_channels ?? ['in_app', 'email'];
  if (!channels.includes('email')) {
    console.log(`[daily-ops-notify] tenant=${tenant.slug} email channel off, skip`);
    return;
  }

  // 2. Resolve recipient: explicit notify_email OR fall back to owner emails
  let recipients: string[] = [];
  if (settings?.notify_email?.trim()) {
    recipients = [settings.notify_email.trim()];
  } else {
    recipients = await findOwnerEmails(client, tenant.id);
  }

  if (recipients.length === 0) {
    reportEvent('daily-ops.notify.no_recipient', {
      scope: 'daily-ops.notify',
      tenant_id,
      extra: { run_id, tenant_slug: tenant.slug },
    });
    return;
  }

  // 3. Render + send
  const html = renderHtml(tenant.name, tenant.slug, run_date, counts);
  const text = renderText(tenant.name, run_date, counts);
  const subject = `${tenant.name} · 今日待审 ${formatCountsSummary(counts)}`;

  for (const to of recipients) {
    try {
      const r = await sendMail({ to, subject, html, text });
      console.log(
        `[daily-ops-notify] tenant=${tenant.slug} to=${to} delivered=${r.delivered}${r.reason ? ` reason=${r.reason}` : ''}`,
      );
    } catch (err) {
      reportError(err, {
        scope: 'daily-ops.notify.send_failed',
        tenant_id,
        extra: { run_id, to },
      });
    }
  }

  reportEvent('daily-ops.notify.sent', {
    scope: 'daily-ops.notify',
    tenant_id,
    extra: { run_id, recipients_count: recipients.length, counts },
  });
}

async function findOwnerEmails(
  client: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data: members } = await client
    .from('tenant_memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('role', ['owner', 'admin']);
  if (!members?.length) return [];

  const emails: string[] = [];
  for (const m of members as Array<{ user_id: string }>) {
    try {
      const { data: u } = await client.auth.admin.getUserById(m.user_id);
      const email = u?.user?.email;
      if (email) emails.push(email);
    } catch {
      // skip — user may have been deleted but membership row lingers
    }
  }
  return emails;
}

function formatCountsSummary(counts: CountsLike): string {
  const g = counts.green ?? 0;
  const y = counts.yellow ?? 0;
  const r = counts.red ?? 0;
  const b = counts.black ?? 0;
  const total = g + y + r + b;
  if (total === 0) return '0 条';
  const parts: string[] = [];
  if (g) parts.push(`${g} 绿`);
  if (y) parts.push(`${y} 黄`);
  if (r) parts.push(`${r} 红`);
  if (b) parts.push(`${b} 黑`);
  return `${total} 条(${parts.join(' / ')})`;
}

function renderHtml(
  tenantName: string,
  tenantSlug: string,
  runDate: string,
  counts: CountsLike,
): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  const todayUrl = `${appUrl}/t/${tenantSlug}/daily-ops`;
  const g = counts.green ?? 0;
  const y = counts.yellow ?? 0;
  const r = counts.red ?? 0;
  const b = counts.black ?? 0;
  const total = g + y + r + b;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${tenantName} · 今日待审</title></head>
<body style="font-family:-apple-system,'PingFang SC',sans-serif;background:#f6f7fa;margin:0;padding:24px;color:#1a1d29">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:28px;border:1px solid #e6e8ee">
    <p style="font-size:11px;letter-spacing:1px;color:#7d8594;text-transform:uppercase;margin:0 0 6px">GEO Studio · 今日待审</p>
    <h1 style="font-size:22px;margin:0 0 4px;font-weight:600">${tenantName}</h1>
    <p style="font-size:13px;color:#7d8594;margin:0 0 20px">${runDate}</p>

    <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
      凌晨 daily-ops 跑完,今日共产生 <strong>${total}</strong> 条变体,
      分布如下:
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 20px">
      <tr>
        <td style="padding:8px 12px;border:1px solid #e6e8ee;background:#ecfdf5;color:#047857;font-size:13px"><strong>🟢 默认通过</strong></td>
        <td style="padding:8px 12px;border:1px solid #e6e8ee;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${g}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e6e8ee;background:#fffbeb;color:#b45309;font-size:13px"><strong>🟡 软异常</strong></td>
        <td style="padding:8px 12px;border:1px solid #e6e8ee;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${y}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e6e8ee;background:#fef2f2;color:#b91c1c;font-size:13px"><strong>🔴 合规拒绝</strong></td>
        <td style="padding:8px 12px;border:1px solid #e6e8ee;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${r}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e6e8ee;background:#f4f4f5;color:#3f3f46;font-size:13px"><strong>⚫ DoD 不过</strong></td>
        <td style="padding:8px 12px;border:1px solid #e6e8ee;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${b}</td>
      </tr>
    </table>

    <p style="font-size:13px;color:#374151;margin:0 0 16px">
      ${g > 0 ? `${g} 条绿色可一键 approve,` : ''}${y + r + b > 0 ? `${y + r + b} 条异常等你判定。` : ''}超时未审,绿色将自动放行。
    </p>

    <p style="margin:0 0 0">
      <a href="${todayUrl}" style="display:inline-block;background:#0f172a;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">进入「今日待审」</a>
    </p>

    <p style="font-size:11px;color:#9ca3af;margin:24px 0 0;border-top:1px solid #e6e8ee;padding-top:16px">
      GEO Studio · daily-ops V1.10 · 在 设置 → 每日自动化 修改通知偏好
    </p>
  </div>
</body>
</html>`;
}

function renderText(tenantName: string, runDate: string, counts: CountsLike): string {
  const g = counts.green ?? 0;
  const y = counts.yellow ?? 0;
  const r = counts.red ?? 0;
  const b = counts.black ?? 0;
  return `${tenantName} · 今日待审 (${runDate})

今日产生:
  🟢 默认通过 ${g}
  🟡 软异常   ${y}
  🔴 合规拒绝 ${r}
  ⚫ DoD 不过 ${b}

进入「今日待审」处理:${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}
`;
}
