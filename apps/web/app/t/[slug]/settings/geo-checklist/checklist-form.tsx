'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { saveGeoChecklist, type GeoChecklistInput } from './actions';

export function ChecklistForm({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: GeoChecklistInput;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: GeoChecklistInput = {
      baidu_baike: fd.get('baidu_baike') === 'on',
      souguo_baike: fd.get('souguo_baike') === 'on',
      amap_poi: fd.get('amap_poi') === 'on',
      baidu_map_poi: fd.get('baidu_map_poi') === 'on',
      dianping_score: Number(fd.get('dianping_score') ?? 0),
      dianping_reviews: Number(fd.get('dianping_reviews') ?? 0),
    };
    setErr(null);
    setSavedAt(null);
    start(async () => {
      try {
        await saveGeoChecklist(tenantSlug, input);
        setSavedAt(new Date().toLocaleTimeString('zh-CN'));
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  const Item = ({
    name,
    label,
    hint,
    defaultChecked,
  }: {
    name: keyof GeoChecklistInput;
    label: string;
    hint: string;
    defaultChecked: boolean;
  }) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background px-3 py-2.5 hover:bg-muted/40">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={pending}
        className="mt-0.5 h-4 w-4"
      />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">P0 实体认知 — 让豆包"知道你存在"</h2>
        <p className="text-xs text-muted-foreground">
          这一层不达标,豆包不会把你纳入候选医院列表 — 后面再多内容都没用。
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <Item
            name="baidu_baike"
            label="百度百科词条"
            hint="代办 ¥800-2000 / 自助申请。规模够即可创建。"
            defaultChecked={initial.baidu_baike}
          />
          <Item
            name="souguo_baike"
            label="搜狗百科词条"
            hint="同百度百科,可一并代办。"
            defaultChecked={initial.souguo_baike}
          />
          <Item
            name="amap_poi"
            label="高德地图 POI 入驻"
            hint="商家入驻 + 门店地址 + 电话。免费。"
            defaultChecked={initial.amap_poi}
          />
          <Item
            name="baidu_map_poi"
            label="百度地图 POI 入驻"
            hint="同高德。免费。豆包对百度系数据也会引用。"
            defaultChecked={initial.baidu_map_poi}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">P1 评价聚合 — 决定豆包给你排第几</h2>
        <p className="text-xs text-muted-foreground">
          大众点评是豆包评价类问题最权威的引用源。建议评价数 ≥ 30,评分 ≥ 4.0。
          <strong>不要刷</strong>,豆包反作弊会降权。
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block space-y-1 rounded-md border border-border bg-background px-3 py-2.5">
            <span className="text-sm font-medium">大众点评评分</span>
            <input
              type="number"
              name="dianping_score"
              defaultValue={initial.dianping_score}
              min={0}
              max={5}
              step={0.1}
              disabled={pending}
              placeholder="如 4.3"
              className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">0-5,常见 4.0-4.8</p>
          </label>
          <label className="block space-y-1 rounded-md border border-border bg-background px-3 py-2.5">
            <span className="text-sm font-medium">点评数量</span>
            <input
              type="number"
              name="dianping_reviews"
              defaultValue={initial.dianping_reviews}
              min={0}
              disabled={pending}
              placeholder="如 87"
              className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">总评价数,大众点评首页显示</p>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
        >
          {pending ? '保存中…' : '保存'}
        </button>
        {savedAt ? (
          <span className="text-xs text-emerald-700">已保存 {savedAt}</span>
        ) : null}
        {err ? (
          <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800">
            {err}
          </span>
        ) : null}
      </div>
    </form>
  );
}
