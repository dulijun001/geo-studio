'use client';

import { useState, useTransition } from 'react';
import { submitCheckin } from './actions';

const STAGES = [
  { value: 'arrived', label: '我刚到店' },
  { value: 'consulted', label: '已咨询过' },
  { value: 'treated', label: '已治疗' },
] as const;

export function CheckinForm({ slug }: { slug: string }) {
  const [code, setCode] = useState('');
  const [doctor, setDoctor] = useState('');
  const [identityKey, setIdentityKey] = useState('');
  const [stage, setStage] = useState<typeof STAGES[number]['value']>('arrived');
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ stage: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const r = await submitCheckin(slug, code, stage, doctor, identityKey);
      if (r.ok) setDone({ stage: r.stage });
      else setErr(r.error);
    });
  };

  if (done) {
    const label = STAGES.find((s) => s.value === done.stage)?.label ?? done.stage;
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-medium">登记成功</p>
        <p className="mt-1">已记录:{label}。</p>
        <p className="mt-3 text-xs text-emerald-800">如需更正,请直接告诉前台。</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="code" className="text-sm font-medium">
          暗号(6 位)
        </label>
        <input
          id="code"
          required
          autoFocus
          autoComplete="off"
          inputMode="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="如 XF8K7M"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base tracking-widest"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="doctor" className="text-sm font-medium">
          医生姓名(可选)
        </label>
        <input
          id="doctor"
          autoComplete="off"
          value={doctor}
          onChange={(e) => setDoctor(e.target.value)}
          placeholder="忘了暗号也可以填这里"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="identity" className="text-sm font-medium">
          您的手机号后 4 位(可选)
        </label>
        <input
          id="identity"
          autoComplete="off"
          inputMode="numeric"
          maxLength={11}
          value={identityKey}
          onChange={(e) => setIdentityKey(e.target.value)}
          placeholder="便于关联您之前的咨询和接触,不强制"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base"
        />
        <p className="text-xs text-muted-foreground">
          填了系统会把您之前看过的内容串成完整旅程,没填也能登记。
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">现在的状态</span>
        <div className="grid grid-cols-3 gap-2">
          {STAGES.map((s) => {
            const on = s.value === stage;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStage(s.value)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  on
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending || code.trim().length === 0}
        className="w-full rounded-md bg-foreground py-3 text-base font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? '提交中…' : '登记'}
      </button>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}
    </form>
  );
}
