'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { clearStaffSession } from '@/lib/staff-session';
import { requireStaff } from '@/lib/staff';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { enqueueRegenerate } from '@/lib/discoverability/enqueue';
import { pushUrlsForTenant } from '@/lib/discoverability/push';

/**
 * STF-3 — per-platform domain whitelist. published_url's hostname must end
 * in one of these for that platform; rejects "any random URL" the operator
 * could paste to fake task completion (which would tank attribution metrics).
 *
 * Match policy: case-insensitive `hostname === d || hostname.endsWith('.' + d)`
 * so subdomains (mp.weixin.qq.com, www.douyin.com, www.toutiao.com) all pass.
 */
const PLATFORM_DOMAINS: Record<string, string[]> = {
  toutiao_article: ['toutiao.com', 'jinritoutiao.com', 'toutiaoimg.com'],
  douyin_script: ['douyin.com', 'iesdouyin.com'],
  douyin_image_text: ['douyin.com', 'iesdouyin.com'],
  wechat_mp: ['weixin.qq.com', 'mp.weixin.qq.com'],
  zhihu: ['zhihu.com'],
  xiaohongshu: ['xiaohongshu.com', 'xhscdn.com'],
  baijiahao: ['baijiahao.baidu.com', 'baidu.com'],
  souhu: ['sohu.com'],
};

function hostnameMatches(hostname: string, allow: string[]): boolean {
  const h = hostname.toLowerCase();
  return allow.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Clean, normalize, and validate staff-submitted published URLs:
 * 1. Extract http(s) URL if staff pasted "标题 https://..." share text.
 * 2. Convert Toutiao creator preview URLs (?pgc_id=xxx) or /item/xxx into canonical
 *    public https://www.toutiao.com/article/xxx/ URLs.
 * 3. Reject creator backend list/editor URLs that contain no article ID
 *    (e.g. mp.toutiao.com/profile_v4/graphic/articles or /publish).
 */
function normalizePublishedUrl(
  rawInput: string,
  platform: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = rawInput.trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) {
    return {
      ok: false,
      error: '请粘贴完整链接（以 http:// 或 https:// 开头）。',
    };
  }
  let url = urlMatch[0];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: '链接格式异常 — 请检查是否粘贴了完整的网页地址' };
  }

  const allow = PLATFORM_DOMAINS[platform];
  if (allow && allow.length > 0 && !hostnameMatches(parsed.hostname, allow)) {
    return {
      ok: false,
      error:
        `链接域名不属于「${platform}」平台（应包含 ${allow.join(' / ')}）。` +
        `请确认粘贴的是对应平台发布的链接。`,
    };
  }

  // Toutiao canonicalization & anti-mistake check
  if (platform === 'toutiao_article' || parsed.hostname.endsWith('toutiao.com')) {
    const pgcId = parsed.searchParams.get('pgc_id') || parsed.searchParams.get('id');
    const itemMatch = parsed.pathname.match(/\/(?:item|article|a|group)\/(\d{9,20})/);
    const wMatch = parsed.pathname.match(/\/w\/(\d{9,20})/);
    const articleId = pgcId && /^\d{9,20}$/.test(pgcId) ? pgcId : itemMatch?.[1];
    if (articleId) {
      url = `https://www.toutiao.com/article/${articleId}/`;
    } else if (wMatch?.[1]) {
      url = `https://www.toutiao.com/w/${wMatch[1]}/`;
    } else if (
      parsed.hostname === 'mp.toutiao.com' ||
      /^\/profile_v4\/graphic\/(articles|publish)/i.test(parsed.pathname)
    ) {
      return {
        ok: false,
        error:
          '你粘贴的是头条后台「作品列表/发文编辑页」地址，里面没有具体文章编号！请点开已发布的那篇文章，复制浏览器地址栏里的具体文章链接。',
      };
    }
  }

  // Zhihu anti-mistake check
  if (platform === 'zhihu' && parsed.hostname.endsWith('zhihu.com')) {
    if (
      parsed.pathname === '/' ||
      parsed.pathname.startsWith('/creator') ||
      parsed.pathname.startsWith('/settings')
    ) {
      return {
        ok: false,
        error:
          '你粘贴的是知乎创作者后台或首页，不是具体文章链接！请点开已发布的文章或回答（形如 zhuanlan.zhihu.com/p/...），再复制链接。',
      };
    }
  }

  return { ok: true, url };
}

/**
 * Result envelope for user-visible errors. Next 14 production builds REDACT
 * any `throw new Error('中文')` from a server action — the staff only sees
 * "An error occurred in the Server Components render…". Returning a
 * { ok: false, error } object preserves the human-readable message.
 *
 * `requireStaff()` and system-level throws are unchanged — those are
 * "unexpected" errors and redaction is correct for them.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };

export async function logoutStaff(): Promise<void> {
  clearStaffSession();
  redirect('/staff/login');
}

/**
 * Record that the staff member has published the task.
 * Input: the URL where the content was posted (for later GEO attribution).
 *
 * Returns ActionResult — see comment on that type. All user-facing validation
 * failures return { ok: false, error: '...' } so the staff sees Chinese.
 */
export async function markTaskPublished(taskId: string, urlRaw: string): Promise<ActionResult> {
  const ctx = await requireStaff();

  const client = getSupabaseServiceClient();

  // Scope update to (task_id, staff_id, tenant_id) — belt & suspenders against tampering.
  const { data: task, error: tErr } = await client
    .from('publish_tasks')
    .select('id, staff_account_id, tenant_id, status, variant_id')
    .eq('id', taskId)
    .single();
  if (tErr || !task) return { ok: false, error: '任务不存在' };
  if (task.staff_account_id !== ctx.staff_id) return { ok: false, error: '这不是分派给你的任务' };
  if (task.tenant_id !== ctx.tenant_id) return { ok: false, error: '租户不匹配' };
  if (task.status === 'published') return { ok: true }; // idempotent

  // STF-3 — verify hostname matches the variant's target platform & normalize URL.
  const { data: variantRow } = await client
    .from('content_variants')
    .select('platform, content_item_id')
    .eq('id', task.variant_id as string)
    .single<{ platform: string; content_item_id: string }>();
  if (!variantRow) return { ok: false, error: '变体不存在,请联系管理员' };

  const normalized = normalizePublishedUrl(urlRaw, variantRow.platform);
  if (!normalized.ok) {
    return normalized;
  }
  const url = normalized.url;

  const { error: upErr } = await client
    .from('publish_tasks')
    .update({
      status: 'published',
      published_url: url,
      published_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (upErr) return { ok: false, error: `打卡失败: ${upErr.message}` };

  await client.from('audit_logs').insert({
    tenant_id: ctx.tenant_id,
    action: 'publish.task_published',
    target_type: 'publish_task',
    target_id: taskId,
    payload: {
      staff_id: ctx.staff_id,
      url,
      // STF-3 — variant context for traceability across the publish chain.
      variant_id: task.variant_id,
      platform: variantRow.platform,
    },
  });

  // V1.7 ↔ V1.8 wiring (D14/D17, ADR 005): the discoverability worker reads
  // content_items WHERE status='published'. Without this transition the
  // articles array is forever empty and llms.txt / feed / sitemap never list
  // any of our content. We flip on FIRST published task per content_item
  // (idempotent) — waiting for "all platforms posted" delays surfacing for
  // weeks and matters less than getting visibility into AI engines fast.
  if (variantRow.content_item_id) {
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
      // 2026 GEO 闭环：一旦文章转入 published，自动将公开站文章链接与回填链接推送到百度/神马站长接口
      const publicBase = process.env.NEXT_PUBLIC_APP_URL ?? 'https://geo.studio';
      const publicArticleUrl = `${publicBase}/c/${ctx.tenant_slug}/articles/${itemRow.id}`;
      void pushUrlsForTenant(ctx.tenant_id, [publicArticleUrl, url]).catch((e) => {
        console.warn('[markTaskPublished] search engine push failed:', e);
      });
    }
  }

  revalidatePath('/staff');
  return { ok: true };
}

export async function markTaskSkipped(taskId: string, reasonRaw: string): Promise<ActionResult> {
  const ctx = await requireStaff();
  const reason = reasonRaw.trim().slice(0, 200);
  if (reason.length < 2) return { ok: false, error: '请填写跳过原因(2 字以上)' };

  const client = getSupabaseServiceClient();

  const { data: task, error: tErr } = await client
    .from('publish_tasks')
    .select('id, staff_account_id, tenant_id, status, variant_id')
    .eq('id', taskId)
    .single();
  if (tErr || !task) return { ok: false, error: '任务不存在' };
  if (task.staff_account_id !== ctx.staff_id) return { ok: false, error: '这不是分派给你的任务' };
  if (task.tenant_id !== ctx.tenant_id) return { ok: false, error: '租户不匹配' };
  if (task.status === 'published') return { ok: false, error: '该任务已发布,不能跳过' };

  // STF-3 — pull variant platform for audit context. Cheap; same query
  // shape as markTaskPublished. Without this, "为什么这条变体被多个员工
  // 跳过" can't be reconstructed without joining audit_logs to publish_tasks
  // to content_variants every time.
  const { data: variantRow } = await client
    .from('content_variants')
    .select('platform')
    .eq('id', task.variant_id as string)
    .maybeSingle<{ platform: string }>();

  const { error: upErr } = await client
    .from('publish_tasks')
    .update({ status: 'skipped', skip_reason: reason })
    .eq('id', taskId);
  if (upErr) return { ok: false, error: `跳过失败: ${upErr.message}` };

  await client.from('audit_logs').insert({
    tenant_id: ctx.tenant_id,
    action: 'publish.task_skipped',
    target_type: 'publish_task',
    target_id: taskId,
    payload: {
      staff_id: ctx.staff_id,
      reason,
      variant_id: task.variant_id,
      platform: variantRow?.platform ?? null,
    },
  });

  revalidatePath('/staff');
  return { ok: true };
}
