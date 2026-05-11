'use client';

import { useState, useTransition } from 'react';
import { markTaskPublished, markTaskSkipped } from './actions';

type TaskProps = {
  id: string;
  platform: string;
  title: string;
  body: string;
  status: string;
  scheduled_at: string | null;
  /** When admin dispatched this task — used for the 24h deadline countdown. */
  dispatched_at: string;
  published_url: string | null;
  time_window: string | null;
  /** 6-char attribution code the staff should embed in their post. */
  activity_code: string | null;
  /** Doctor name hook (= staff real name); shown for context. */
  doctor_name: string | null;
};

const DEADLINE_HOURS = 24;

const PLATFORM_LABEL: Record<string, string> = {
  toutiao_article: '头条号文章',
  douyin_script: '抖音脚本',
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  xiaohongshu: '小红书',
  baijiahao: '百家号',
  souhu: '搜狐号',
};

const PLATFORM_SCHEME: Record<string, string> = {
  toutiao_article: 'snssdk143://',
  douyin_script: 'snssdk1128://',
  xiaohongshu: 'xhsdiscover://',
};

/**
 * Convert markdown into platform-appropriate plain text.
 *
 * Generators write markdown by default. Chinese social platforms paste boxes
 * are plain text — "### 标题" shows verbatim, "**bold**" leaves literal
 * asterisks. We restyle by platform, since one size doesn't fit:
 *
 *   - 小红书 / 百家号: emoji-driven, conversational → 🔸 prefix on H2/H3 headings
 *   - 抖音脚本: step-by-step, numbered → 1️⃣ 2️⃣ 3️⃣ for sequential headings
 *   - 头条 / 知乎 / 公众号 / 搜狐: long-form, professional → ▍ prefix on headings
 *
 * Body paragraph rules are platform-agnostic:
 *   - drops bold/italic/code markers but keeps text
 *   - dashes and asterisk bullets become •
 *   - link syntax [text](url) → "text(url)" if external, else just text
 *   - drops blockquotes, horizontal rules, code fences
 *   - collapses 3+ blank lines to 2, trims edges
 *
 * Idempotent on already-plain text.
 */
function stripMarkdown(input: string, platform?: string): string {
  const headingPrefix = headingPrefixFor(platform);
  let stepNum = 0; // for 抖音 numbered sections
  return input
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) return '';

      // Heading line — replace ATX markers with platform-specific prefix.
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const text = stripInline(heading[2]!);
        if (headingPrefix === 'numbered') {
          stepNum += 1;
          const digit = '0123456789'[stepNum] ?? String(stepNum);
          const emoji = stepNum <= 9 ? `${digit}⃣` : `${stepNum}.`;
          return `${emoji} ${text}`;
        }
        return `${headingPrefix} ${text}`;
      }

      let s = line.replace(/^(\s*)[-*+]\s+/, '$1• ');
      s = stripInline(s);
      s = s.replace(/^\s{0,3}>\s?/, '');
      if (/^\s*([-*_]\s*){3,}$/.test(s)) return '';
      return s;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function headingPrefixFor(platform?: string): string {
  switch (platform) {
    case 'xiaohongshu':
    case 'baijiahao':
      return '🔸';
    case 'douyin_script':
      return 'numbered'; // sentinel — handled inline
    default:
      // 头条 / 知乎 / 公众号 / 搜狐 / unknown: vertical bar feels professional
      return '▍';
  }
}

function stripInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
      /^https?:\/\//.test(url) ? `${text}(${url})` : text,
    );
}

export function TaskCard({ task }: { task: TaskProps }) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'idle' | 'publish' | 'skip'>('idle');
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const platformLabel = PLATFORM_LABEL[task.platform] ?? task.platform;
  const appScheme = PLATFORM_SCHEME[task.platform];

  const copyContent = async () => {
    // Auto-append the attribution CTA when an activity_code exists. This is
    // what makes /c/[slug]/checkin able to flow conversions back — without it
    // the funnel stays empty even with hooks in DB.
    const cta = task.activity_code
      ? `\n\n— 到院请说「${task.doctor_name ?? ''}医生 ${task.activity_code}」,我会知道你是看了这条来的。`
      : '';
    const text = stripMarkdown(`${task.title}\n\n${task.body}${cta}`, task.platform);

    // navigator.clipboard requires a secure context (HTTPS or localhost). When
    // the staff PWA is reached over plain HTTP via a tunnel/IP, clipboard is
    // undefined — fall back to a textarea + execCommand('copy'). The textarea
    // must be on-screen (not display:none / opacity:0 / off-screen) for some
    // browsers to actually copy the FULL value rather than only what was
    // visually selected — iOS Safari and WeChat in particular care. We
    // mitigate by placing it within the viewport but visually neutral, and we
    // explicitly focus + select before issuing the copy command.
    const writeFallback = (s: string): boolean => {
      const ta = document.createElement('textarea');
      ta.value = s;
      // contentEditable=true on iOS allows full-range selection
      ta.contentEditable = 'true';
      ta.readOnly = false;
      // visible-but-invisible: in viewport (so iOS doesn't ignore selection),
      // but 1px and zero opacity so user doesn't see the flash
      ta.style.position = 'fixed';
      ta.style.left = '0';
      ta.style.top = '0';
      ta.style.width = '1px';
      ta.style.height = '1px';
      ta.style.padding = '0';
      ta.style.border = 'none';
      ta.style.outline = 'none';
      ta.style.boxShadow = 'none';
      ta.style.background = 'transparent';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      const previousActive = document.activeElement as HTMLElement | null;
      try {
        ta.focus({ preventScroll: true });
        // iOS needs an explicit Range over a contentEditable element
        const range = document.createRange();
        range.selectNodeContents(ta);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        // Also do the input-style selection as a redundant guard
        ta.setSelectionRange(0, s.length);
        const ok = document.execCommand('copy');
        sel?.removeAllRanges();
        return ok;
      } catch {
        return false;
      } finally {
        document.body.removeChild(ta);
        previousActive?.focus?.();
      }
    };

    setErr(null);
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!writeFallback(text)) {
        throw new Error('execCommand copy failed');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr('复制失败,请长按选中文案手动复制。');
    }
  };

  const submitPublish = () => {
    setErr(null);
    startTransition(async () => {
      try {
        const r = await markTaskPublished(task.id, input);
        if (!r.ok) {
          setErr(r.error);
          return;
        }
        setMode('idle');
        setInput('');
      } catch (e) {
        setErr(e instanceof Error ? e.message : '打卡失败');
      }
    });
  };

  const submitSkip = () => {
    setErr(null);
    startTransition(async () => {
      try {
        const r = await markTaskSkipped(task.id, input);
        if (!r.ok) {
          setErr(r.error);
          return;
        }
        setMode('idle');
        setInput('');
      } catch (e) {
        setErr(e instanceof Error ? e.message : '跳过失败');
      }
    });
  };

  const done = task.status === 'published';
  const skipped = task.status === 'skipped';

  // Time-to-publish countdown (only meaningful for unfinished tasks).
  const dispatchedMs = new Date(task.dispatched_at).getTime();
  const deadlineMs = dispatchedMs + DEADLINE_HOURS * 3600 * 1000;
  const remainingMs = deadlineMs - Date.now();
  const overdue = !done && !skipped && remainingMs < 0;
  const remainingLabel = formatRemaining(remainingMs);

  return (
    <article
      className={`rounded-md border bg-background p-4 ${
        done
          ? 'border-emerald-500/30 bg-emerald-500/[0.10]/40'
          : skipped
            ? 'border-border/50 opacity-60'
            : overdue
              ? 'border-rose-500/40 bg-rose-500/[0.10]/40'
              : 'border-border'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {platformLabel}
        </span>
        <span
          className={
            overdue
              ? 'rounded-full bg-rose-500/[0.10] px-2 py-0.5 text-[11px] font-medium text-rose-300'
              : !done && !skipped && remainingMs < 6 * 3600 * 1000
                ? 'rounded-full bg-amber-500/[0.12] px-2 py-0.5 text-[11px] font-medium text-amber-300'
                : 'text-xs text-muted-foreground'
          }
        >
          {done || skipped
            ? task.time_window === 'morning'
              ? '上午档'
              : task.time_window === 'afternoon'
                ? '下午档'
                : '今日'
            : overdue
              ? '已逾期 · 请尽快回填'
              : `还剩 ${remainingLabel}`}
        </span>
      </div>

      <h2 className="mb-2 font-medium leading-snug">{task.title}</h2>
      <p className="mb-3 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
        {task.body}
      </p>

      {task.activity_code ? (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/[0.10] px-3 py-2 text-xs text-amber-200">
          <div className="font-medium">📌 发布时记得带上暗号</div>
          <div className="mt-0.5">
            点「复制文案」会自动在末尾加一句话:
            <br />
            <span className="font-mono">
              {`「${task.doctor_name ?? ''}医生 ${task.activity_code}」`}
            </span>
            <br />
            患者来店时报这串字,系统能归到这条内容。
          </div>
        </div>
      ) : null}

      {done ? (
        <div className="space-y-1 rounded-md bg-emerald-500/[0.12] px-3 py-2 text-xs text-emerald-300">
          <div className="font-medium">已发布 ✓</div>
          {task.published_url ? (
            <a
              href={task.published_url}
              target="_blank"
              rel="noreferrer"
              className="block truncate underline underline-offset-2"
            >
              {task.published_url}
            </a>
          ) : null}
        </div>
      ) : skipped ? (
        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          已跳过
        </div>
      ) : mode === 'idle' ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyContent}
              className="flex-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
            >
              {copied ? '已复制 ✓' : '复制文案'}
            </button>
            {appScheme ? (
              <a
                href={appScheme}
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-center text-xs font-medium"
              >
                打开 App
              </a>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('publish')}
              className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              我已发布
            </button>
            <button
              type="button"
              onClick={() => setMode('skip')}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              跳过
            </button>
          </div>
        </div>
      ) : mode === 'publish' ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">粘贴发布后的文章链接</span>
            <input
              type="url"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={submitPublish}
              className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {isPending ? '提交中…' : '提交打卡'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setInput('');
                setErr(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
            >
              取消
            </button>
          </div>
          {err ? <p className="text-xs text-rose-300">{err}</p> : null}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">为什么跳过?(会同步给管理员)</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例:今日限流"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={submitSkip}
              className="flex-1 rounded-md bg-muted px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            >
              {isPending ? '提交中…' : '确认跳过'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setInput('');
                setErr(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
            >
              取消
            </button>
          </div>
          {err ? <p className="text-xs text-rose-300">{err}</p> : null}
        </div>
      )}
    </article>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h >= 1) return `${h}h${m > 0 ? `${m}m` : ''}`;
  return `${m}m`;
}
