'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStaffAccount } from './actions';

const ROLES = [
  { value: 'doctor', label: '医生' },
  { value: 'consultant', label: '咨询' },
  { value: 'receptionist', label: '前台' },
  { value: 'marketing', label: '市场' },
  { value: 'nurse', label: '护理' },
  { value: 'other', label: '其他' },
] as const;

const PLATFORMS = [
  { value: 'toutiao_article', label: '头条号' },
  { value: 'douyin_script', label: '抖音' },
  { value: 'wechat_mp', label: '公众号' },
  { value: 'zhihu', label: '知乎' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'baijiahao', label: '百家号' },
  { value: 'souhu', label: '搜狐号' },
] as const;

export function NewStaffForm({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [role, setRole] = useState<typeof ROLES[number]['value']>('doctor');
  const [phone, setPhone] = useState('');
  const [tags, setTags] = useState('');
  const [platforms, setPlatforms] = useState<Set<string>>(new Set());

  const reset = () => {
    setName('');
    setRole('doctor');
    setPhone('');
    setTags('');
    setPlatforms(new Set());
    setErr(null);
  };

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        await createStaffAccount(tenantSlug, {
          real_name: name,
          role,
          phone,
          tags,
          platforms: Array.from(platforms),
        });
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '新建失败');
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        新建员工
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-elevated mb-2 space-y-4 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">新建员工</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          取消
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="姓名" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="贾真真"
            required
            className="input"
          />
        </Field>
        <Field label="岗位" required>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="input"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="手机号" required>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="13800000001"
            inputMode="numeric"
            pattern="^1[3-9]\d{9}$"
            required
            className="input font-mono"
          />
        </Field>
      </div>

      <Field label="人设标签" hint="逗号分隔,最多 8 个,用于派单匹配(如「种植牙、复杂病例、糖尿病」)">
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="种植牙, 术后护理"
          className="input"
        />
      </Field>

      <Field label="发布平台" hint="勾员工有账号的平台,派单算法只往这些平台分配任务">
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const on = platforms.has(p.value);
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlatform(p.value)}
                className={
                  'rounded-full px-3 py-1 text-xs transition-colors ' +
                  (on
                    ? 'bg-foreground text-background'
                    : 'border border-border bg-background text-foreground hover:bg-muted')
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-2 pt-2">
        {err ? <p className="mr-auto text-xs text-rose-700">{err}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="btn-primary disabled:opacity-60"
        >
          {pending ? '提交中…' : '保存'}
        </button>
      </div>

      <style jsx>{`
        :global(.input) {
          display: block;
          width: 100%;
          border-radius: var(--radius-md);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          line-height: 1.25rem;
        }
        :global(.input:focus-visible) {
          outline: 2px solid hsl(var(--ring) / 0.6);
          outline-offset: 1px;
          border-color: hsl(var(--ring));
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
