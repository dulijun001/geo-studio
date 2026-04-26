/**
 * Weekly knowledge-base report (V1.5-10).
 *
 * Triggered by pg-boss schedule (Monday 09:00 Asia/Shanghai = Mon 01:00 UTC).
 * Per-tenant fan-out:
 *   1. List active tenants
 *   2. For each, compute KB stats over the past 7 days
 *      (added / updated / deleted, derived counts, top changed paths)
 *   3. Find owner/admin emails
 *   4. Render HTML report → sendMail
 *
 * Same shape as daily-report so customers get consistent email layout.
 */
import { getServiceClient } from '../lib/supabase';
import { sendMail } from '../lib/mailer';

export type WeeklyKnowledgeReportJob = {
  /** Optional: only report for one tenant (useful for manual replays). */
  tenant_slug?: string;
};

type Stats = {
  total: number;
  added: number;
  updated: number;
  deleted: number;
  compliance_keywords: number;
  staff_synced: number;
  brand_vocab_synced: number;
  recent_changes: Array<{ source_path: string; title: string | null; updated_at: string }>;
};

export async function handleWeeklyKnowledgeReport(
  data: WeeklyKnowledgeReportJob = {},
): Promise<void> {
  const client = getServiceClient();

  const { data: tenants } = await client
    .from('tenants')
    .select('id, name, slug')
    .is('deleted_at', null);
  if (!tenants?.length) {
    console.log('[weekly-kb-report] no tenants');
    return;
  }

  const targets = data.tenant_slug
    ? tenants.filter((t) => t.slug === data.tenant_slug)
    : tenants;

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  for (const t of targets as Array<{ id: string; name: string; slug: string }>) {
    const stats = await computeStats(t.id, sevenDaysAgo);

    if (stats.total === 0) {
      console.log(`[weekly-kb-report] tenant=${t.slug} no KB indexed yet, skip email`);
      continue;
    }

    const recipients = await findRecipients(t.id);
    if (recipients.length === 0) {
      console.log(`[weekly-kb-report] tenant=${t.slug} no owner/admin recipients, skip`);
      continue;
    }

    const html = renderHtml(t.name, t.slug, stats);
    const text = renderText(t.name, stats);
    const subject = `${t.name} · 知识库周报(本周 +${stats.added} / ~${stats.updated} / -${stats.deleted})`;

    for (const to of recipients) {
      const r = await sendMail({ to, subject, html, text });
      if (!r.delivered) {
        console.warn(`[weekly-kb-report] tenant=${t.slug} to=${to} undelivered: ${r.reason}`);
      }
    }
  }
}

async function computeStats(tenantId: string, since: string): Promise<Stats> {
  const client = getServiceClient();
  const [
    { count: total },
    { count: added },
    { count: updated },
    { count: deleted },
    { count: compliance_keywords },
    { count: staff_synced },
    { count: brand_vocab_synced },
    { data: recent },
  ] = await Promise.all([
    client
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    client
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .is('deleted_at', null),
    client
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('updated_at', since)
      .lt('created_at', since)
      .is('deleted_at', null),
    client
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('deleted_at', since),
    client
      .from('compliance_keywords')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('source_path', 'is', null),
    client
      .from('staff_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('bio_md_path', 'is', null)
      .is('deleted_at', null),
    client
      .from('brand_vocab')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('term_type', ['doctor', 'service', 'competitor'])
      .is('deleted_at', null),
    client
      .from('knowledge_sources')
      .select('source_path, title, updated_at')
      .eq('tenant_id', tenantId)
      .gte('updated_at', since)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(10),
  ]);

  return {
    total: total ?? 0,
    added: added ?? 0,
    updated: updated ?? 0,
    deleted: deleted ?? 0,
    compliance_keywords: compliance_keywords ?? 0,
    staff_synced: staff_synced ?? 0,
    brand_vocab_synced: brand_vocab_synced ?? 0,
    recent_changes: (recent ?? []) as Stats['recent_changes'],
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

function renderHtml(tenantName: string, tenantSlug: string, s: Stats): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const link = `${appUrl}/t/${tenantSlug}/settings/knowledge`;
  const periodLabel = formatWeekLabel();

  const recentList = s.recent_changes
    .slice(0, 8)
    .map(
      (r) =>
        `<li style="padding:6px 0;border-bottom:1px solid #f0f1f5"><span style="color:#1a1d29">${escape(r.title ?? r.source_path)}</span><span style="color:#9aa1ad;font-size:12px;margin-left:8px">${escape(r.source_path)}</span></li>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${escape(tenantName)} · 知识库周报</title></head>
<body style="font-family:-apple-system,'PingFang SC',sans-serif;background:#f6f7fa;margin:0;padding:24px;color:#1a1d29">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:28px;border:1px solid #e6e8ee">
    <p style="font-size:11px;letter-spacing:1px;color:#7d8594;text-transform:uppercase;margin:0 0 6px">GEO Studio · 知识库周报</p>
    <h1 style="font-size:22px;margin:0 0 4px;font-weight:600">${escape(tenantName)}</h1>
    <p style="font-size:13px;color:#7d8594;margin:0 0 20px">${periodLabel}</p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="border:1px solid #e6e8ee;border-radius:8px;padding:14px"><p style="font-size:11px;color:#7d8594;text-transform:uppercase;margin:0 0 4px">索引篇数</p><p style="font-size:24px;font-weight:600;margin:0">${s.total}</p></div>
      <div style="border:1px solid #e6e8ee;border-radius:8px;padding:14px"><p style="font-size:11px;color:#7d8594;text-transform:uppercase;margin:0 0 4px">本周新增</p><p style="font-size:24px;font-weight:600;margin:0;color:#15803d">+${s.added}</p></div>
      <div style="border:1px solid #e6e8ee;border-radius:8px;padding:14px"><p style="font-size:11px;color:#7d8594;text-transform:uppercase;margin:0 0 4px">本周修改</p><p style="font-size:24px;font-weight:600;margin:0;color:#3056d3">~${s.updated}</p></div>
      <div style="border:1px solid #e6e8ee;border-radius:8px;padding:14px"><p style="font-size:11px;color:#7d8594;text-transform:uppercase;margin:0 0 4px">本周删除</p><p style="font-size:24px;font-weight:600;margin:0;color:${s.deleted > 0 ? '#b91c1c' : '#1a1d29'}">-${s.deleted}</p></div>
    </div>

    <h2 style="font-size:14px;font-weight:600;margin:24px 0 8px">派生数据(由 KB 自动维护)</h2>
    <p style="font-size:13px;color:#4a5060;margin:0 0 16px">合规词库 <strong>${s.compliance_keywords}</strong> 条 · KB 同步医生 <strong>${s.staff_synced}</strong> 位 · 品牌词典 <strong>${s.brand_vocab_synced}</strong> 条</p>

    ${s.recent_changes.length > 0 ? `
    <h2 style="font-size:14px;font-weight:600;margin:24px 0 8px">本周变更前 ${Math.min(8, s.recent_changes.length)} 篇</h2>
    <ul style="list-style:none;padding:0;margin:0;font-size:13px">${recentList}</ul>
    ` : ''}

    ${s.deleted > 5 ? `
    <div style="margin-top:20px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#991b1b">
      ⚠️ 本周删除 ${s.deleted} 篇,接近异常阈值。如非预期,请检查 ECS snapshot(/opt/kb/snapshots/)恢复。
    </div>
    ` : ''}

    <a href="${link}" style="display:inline-block;margin-top:24px;padding:10px 18px;background:#1a1d29;color:white;text-decoration:none;border-radius:8px;font-size:14px">查看完整知识库状态 →</a>

    <p style="margin-top:32px;font-size:11px;color:#9aa1ad;line-height:1.6">
      你正在收到 GEO Studio 知识库周报。源数据是 <code>~/Workspace/songshu-knowledge-base/</code> 下你和团队这周编辑的 md 文件。<br>
      不想再收?在「设置 → 通知偏好」关闭(待 V2 实现)。
    </p>
  </div>
</body>
</html>`;
}

function renderText(tenantName: string, s: Stats): string {
  return [
    `${tenantName} · 知识库周报`,
    formatWeekLabel(),
    '',
    `索引篇数: ${s.total}`,
    `本周新增: +${s.added}`,
    `本周修改: ~${s.updated}`,
    `本周删除: -${s.deleted}`,
    '',
    `派生数据: 合规 ${s.compliance_keywords} · 医生 ${s.staff_synced} · 词典 ${s.brand_vocab_synced}`,
  ].join('\n');
}

function formatWeekLabel(): string {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 86400 * 1000);
  const f = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${f(start)} - ${f(now)}`;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
