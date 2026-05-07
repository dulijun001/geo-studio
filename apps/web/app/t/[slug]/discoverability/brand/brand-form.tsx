'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  type BrandDiscoverabilityInput,
  updateBrandDiscoverability,
} from './actions';

const DAYS: Array<{ key: keyof BrandDiscoverabilityInput['business_hours']; label: string }> = [
  { key: 'mon', label: '周一' },
  { key: 'tue', label: '周二' },
  { key: 'wed', label: '周三' },
  { key: 'thu', label: '周四' },
  { key: 'fri', label: '周五' },
  { key: 'sat', label: '周六' },
  { key: 'sun', label: '周日' },
];

const SOCIAL_PLATFORMS: Array<{ key: keyof BrandDiscoverabilityInput['social_urls']; label: string }> = [
  { key: 'wechat_mp', label: '公众号' },
  { key: 'weibo', label: '微博' },
  { key: 'douyin', label: '抖音' },
  { key: 'xiaohongshu', label: '小红书' },
];

const COMMON_SPECIALTIES = [
  'Dentistry',
  'Orthodontics',
  'OralSurgery',
  'PediatricDentistry',
  'Endodontics',
  'Periodontics',
  'Prosthodontics',
];

export function BrandForm({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: BrandDiscoverabilityInput;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [v, setV] = useState(initial);

  const submit = () => {
    setErr(null);
    setDone(false);
    start(async () => {
      try {
        await updateBrandDiscoverability(tenantSlug, v);
        setDone(true);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  return (
    <div className="space-y-6">
      <Section title="地址" hint="schema.org/PostalAddress + GeoCoordinates">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="城市">
            <input className="form-input" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} placeholder="昆明" />
          </Field>
          <Field label="区/县">
            <input className="form-input" value={v.district} onChange={(e) => setV({ ...v, district: e.target.value })} placeholder="西山区" />
          </Field>
          <Field label="街道">
            <input className="form-input" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} placeholder="某某路 100 号" />
          </Field>
          <Field label="邮编">
            <input className="form-input" value={v.postal_code} onChange={(e) => setV({ ...v, postal_code: e.target.value })} placeholder="650100" />
          </Field>
          <Field label="省/直辖市">
            <input className="form-input" value={v.region} onChange={(e) => setV({ ...v, region: e.target.value })} placeholder="云南" />
          </Field>
          <Field label="国家(默认 CN)">
            <input className="form-input" value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} placeholder="CN" />
          </Field>
          <Field label="纬度(latitude)">
            <input
              type="number"
              step="any"
              className="form-input"
              value={v.latitude ?? ''}
              onChange={(e) => setV({ ...v, latitude: parseNumOrNull(e.target.value) })}
              placeholder="24.95"
            />
          </Field>
          <Field label="经度(longitude)">
            <input
              type="number"
              step="any"
              className="form-input"
              value={v.longitude ?? ''}
              onChange={(e) => setV({ ...v, longitude: parseNumOrNull(e.target.value) })}
              placeholder="102.7"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="服务覆盖区域"
        hint="schema.org/areaServed + AI 拓词地理边界。逗号分隔,例:昆明, 云南 — 这两层都会被 AI 引擎识别"
      >
        <ServiceAreasInput
          value={v.service_areas}
          onChange={(arr) => setV({ ...v, service_areas: arr })}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          只填一座城市可以,加上省份(或附近地市)能让 AI 拓词时把<strong>本地化长尾词</strong>限定在这些地区,
          不再返回北京 / 上海等无关城市的本地词。
        </p>
      </Section>

      <Section title="医疗专科" hint="schema.org/medicalSpecialty。逗号分隔英文,豆包索引时按这识别诊所类型">
        <SpecialtiesInput value={v.medical_specialties} onChange={(arr) => setV({ ...v, medical_specialties: arr })} />
      </Section>

      <Section title="营业时间" hint="HH:MM-HH:MM 格式,空 = 当天闭门">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {DAYS.map((d) => (
            <Field key={d.key} label={d.label}>
              <input
                className="form-input font-mono"
                value={v.business_hours[d.key]}
                onChange={(e) =>
                  setV({
                    ...v,
                    business_hours: { ...v.business_hours, [d.key]: e.target.value },
                  })
                }
                placeholder="09:00-18:00"
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="社交媒体 / 网站" hint="schema.org/Organization.sameAs。AI 引擎跨源验证身份">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="官网 URL">
            <input
              className="form-input"
              value={v.website_url}
              onChange={(e) => setV({ ...v, website_url: e.target.value })}
              placeholder="https://your-site.com (留空 = 我们托管)"
            />
          </Field>
          {SOCIAL_PLATFORMS.map((p) => (
            <Field key={p.key} label={p.label}>
              <input
                className="form-input"
                value={v.social_urls[p.key]}
                onChange={(e) =>
                  setV({ ...v, social_urls: { ...v.social_urls, [p.key]: e.target.value } })
                }
                placeholder={`https://...`}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="品牌长描述" hint="用于 llms-full.txt + Organization.description。建议 ≥ 80 字">
        <textarea
          className="form-input min-h-[120px]"
          value={v.description_md}
          onChange={(e) => setV({ ...v, description_md: e.target.value })}
          placeholder="松鼠口腔提供专业种植 / 隐形矫正 / 儿牙 / 牙周病等服务,医师团队来自..."
        />
      </Section>

      <Section title="资质 / 认证" hint="医疗机构执业许可证 / JCI / 三甲 / 医保定点 等">
        <CredentialsEditor
          value={v.credentials}
          onChange={(arr) => setV({ ...v, credentials: arr })}
        />
      </Section>

      {err && <div className="rounded-md bg-rose-500/[0.10] px-3 py-2 text-sm text-rose-300">{err}</div>}
      {done && <div className="rounded-md bg-emerald-500/[0.10] px-3 py-2 text-sm text-emerald-400">✓ 保存成功 — artifacts 已自动重建入队</div>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SpecialtiesInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = (s: string) => {
    const t = s.trim();
    if (!t) return;
    if (value.includes(t)) return;
    onChange([...value, t]);
    setDraft('');
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((s, i) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {s}
            <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-foreground">
              ×
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-muted-foreground">(还没有添加专科)</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="form-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="Dentistry / Orthodontics / ..."
        />
        <button
          type="button"
          onClick={() => add(draft)}
          className="rounded-md border border-border bg-card px-3 text-xs hover:bg-muted"
        >
          添加
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {COMMON_SPECIALTIES.filter((s) => !value.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Chip-style multi-area editor (migration 0026).
 * Suggests common geographic granularities so operators can one-click add
 * city + province + nearby cities. Manual input also accepted.
 */
function ServiceAreasInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = (s: string) => {
    const t = s.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setDraft('');
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((s, i) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {s}
            <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-foreground">
              ×
            </button>
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground">
            (空 = 不限地域,AI 拓词会输出全国通用词;建议至少填一个城市)
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="form-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="例:昆明 / 云南 / 西山区"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          className="rounded-md border border-border bg-card px-3 text-xs hover:bg-muted"
        >
          添加
        </button>
      </div>
    </div>
  );
}

function CredentialsEditor({
  value,
  onChange,
}: {
  value: Array<{ name: string; issuer: string; number: string }>;
  onChange: (v: Array<{ name: string; issuer: string; number: string }>) => void;
}) {
  const set = (idx: number, partial: Partial<{ name: string; issuer: string; number: string }>) => {
    onChange(value.map((c, i) => (i === idx ? { ...c, ...partial } : c)));
  };
  const add = () => onChange([...value, { name: '', issuer: '', number: '' }]);
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {value.map((c, i) => (
        <div key={i} className="grid grid-cols-1 items-end gap-2 md:grid-cols-[2fr_2fr_1fr_auto]">
          <Field label="名称">
            <input className="form-input" value={c.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="医疗机构执业许可证" />
          </Field>
          <Field label="发证机关">
            <input className="form-input" value={c.issuer} onChange={(e) => set(i, { issuer: e.target.value })} placeholder="昆明卫健委" />
          </Field>
          <Field label="编号">
            <input className="form-input" value={c.number} onChange={(e) => set(i, { number: e.target.value })} placeholder="KM-12345" />
          </Field>
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/[0.10]"
          >
            移除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
      >
        + 添加资质
      </button>
    </div>
  );
}

function parseNumOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
