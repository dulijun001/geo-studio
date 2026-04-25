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
  published_url: string | null;
  time_window: string | null;
  /** 6-char attribution code the staff should embed in their post. */
  activity_code: string | null;
  /** Doctor name hook (= staff real name); shown for context. */
  doctor_name: string | null;
};

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
    const text = `${task.title}\n\n${task.body}${cta}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr('复制失败,请长按选中手动复制。');
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

  return (
    <article className={`rounded-md border bg-background p-4 ${done ? 'border-emerald-200 bg-emerald-50/40' : skipped ? 'border-border/50 opacity-60' : 'border-border'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {platformLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {task.time_window === 'morning' ? '上午档' : task.time_window === 'afternoon' ? '下午档' : '今日'}
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
