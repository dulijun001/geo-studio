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
 * Strip markdown so pasted text displays correctly on Chinese social platforms.
 *
 * Generators (Doubao, AI draft) write markdown by default. 小红书 / 抖音 / 头条 /
 * 知乎 paste boxes are plain text — they show "### 标题" verbatim, "**bold**"
 * with literal asterisks, etc. This converter:
 *
 *   - drops ATX header markers (## #), keeps the title text
 *   - drops emphasis markers (** _ *) but keeps the inner words
 *   - drops link syntax [text](url), keeping just `text` (or text + url if external)
 *   - turns "- " / "* " bullets into "• "
 *   - strips inline code backticks and code-fence lines
 *   - leaves numbered lists (1.) and emoji intact
 *
 * Idempotent: running twice produces the same output.
 */
function stripMarkdown(input: string): string {
  return input
    .split('\n')
    .map((line) => {
      // strip code fences entirely
      if (/^\s*```/.test(line)) return '';
      // strip ATX heading markers (#, ##, ###...) keep the rest
      let s = line.replace(/^\s{0,3}#{1,6}\s+/, '');
      // bullet list: "- foo" / "* foo" / "+ foo" → "• foo"
      s = s.replace(/^(\s*)[-*+]\s+/, '$1• ');
      // bold/italic markers — keep text, drop markers
      s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
      s = s.replace(/__([^_]+)__/g, '$1');
      s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
      s = s.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
      // inline code: drop backticks, keep code text
      s = s.replace(/`([^`]+)`/g, '$1');
      // links: [text](url) → text (only keep URL if it looks external)
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
        return /^https?:\/\//.test(url) ? `${text}(${url})` : text;
      });
      // blockquote prefix
      s = s.replace(/^\s{0,3}>\s?/, '');
      // horizontal rule
      if (/^\s*([-*_]\s*){3,}$/.test(s)) return '';
      return s;
    })
    .join('\n')
    // collapse 3+ blank lines down to 2 (preserve paragraph breaks)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    const text = stripMarkdown(`${task.title}\n\n${task.body}${cta}`);

    // navigator.clipboard requires a secure context (HTTPS or localhost). When
    // the staff PWA is reached over plain HTTP via a tunnel/IP, clipboard is
    // undefined and the modern API throws — fall back to a hidden-textarea +
    // execCommand('copy') trick. Deprecated but works on every browser that
    // matters for this product (WeChat browser, Safari iOS, Chrome Android).
    const writeFallback = (s: string): boolean => {
      try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, s.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
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
        await markTaskPublished(task.id, input);
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
        await markTaskSkipped(task.id, input);
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
          ? 'border-emerald-200 bg-emerald-50/40'
          : skipped
            ? 'border-border/50 opacity-60'
            : overdue
              ? 'border-rose-300 bg-rose-50/40'
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
              ? 'rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800'
              : !done && !skipped && remainingMs < 6 * 3600 * 1000
                ? 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800'
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
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
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
        <div className="space-y-1 rounded-md bg-emerald-100 px-3 py-2 text-xs text-emerald-800">
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
          {err ? <p className="text-xs text-rose-700">{err}</p> : null}
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
          {err ? <p className="text-xs text-rose-700">{err}</p> : null}
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
