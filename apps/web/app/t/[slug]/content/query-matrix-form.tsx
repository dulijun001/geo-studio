'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import {
  createAiDraft,
  proposeContentMatrix,
  type CreateAiDraftInput,
  type MatrixIdea,
  type ProposeMatrixResult,
} from './actions';

const AUDIENCE_OPTIONS = [
  '焦虑型新手妈妈',
  '理性规划型家长',
  '三高人群',
  '中老年缺牙患者',
  '糖尿病种植人群',
  '青少年正畸',
  '孕期口腔关注',
  '上班族隐形矫正',
];

const TIER_BG: Record<MatrixIdea['tier'], string> = {
  P2: 'bg-amber-500/[0.10] text-amber-300 border border-amber-500/30 border-amber-500/30',
  P3: 'bg-rose-500/[0.10] text-rose-300 border border-rose-500/30 border-rose-500/30',
  P4: 'bg-sky-500/[0.10] text-sky-300 border border-sky-500/30 border-sky-500/30',
};

const TIER_LABEL: Record<MatrixIdea['tier'], string> = {
  P2: 'P2 专业内容',
  P3: 'P3 视频(豆包加分)',
  P4: 'P4 个人化',
};

const PLATFORM_LABEL: Record<CreateAiDraftInput['platform'], string> = {
  wechat_mp: '公众号',
  zhihu: '知乎',
  toutiao_article: '头条号',
  douyin_script: '抖音脚本',
  xiaohongshu: '小红书',
};

type DraftStatus =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'done'; content_item_id: string }
  | { state: 'failed'; error: string };

export function QueryMatrixForm({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [proposing, startProposing] = useTransition();
  const [proposeErr, setProposeErr] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<ProposeMatrixResult | null>(null);
  const [audience, setAudience] = useState(AUDIENCE_OPTIONS[0]!);
  const [drafts, setDrafts] = useState<Record<number, DraftStatus>>({});

  const reset = () => {
    setMatrix(null);
    setProposeErr(null);
    setDrafts({});
  };

  const onPropose = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const query = ((fd.get('query') as string | null) ?? '').trim();
    setProposeErr(null);
    setMatrix(null);
    setDrafts({});
    startProposing(async () => {
      try {
        const result = await proposeContentMatrix(tenantSlug, { query, audience });
        setMatrix(result);
      } catch (e) {
        setProposeErr(e instanceof Error ? e.message : '生成矩阵失败');
      }
    });
  };

  const onCreateDraft = async (idx: number, idea: MatrixIdea) => {
    if (!matrix) return;
    setDrafts((d) => ({ ...d, [idx]: { state: 'pending' } }));
    try {
      const topic =
        idea.recommended_doctor
          ? `${idea.title}(${idea.recommended_doctor}视角)`
          : idea.title;
      const result = await createAiDraft(tenantSlug, {
        topic,
        audience: matrix.audience,
        platform: idea.platform,
      });
      setDrafts((d) => ({
        ...d,
        [idx]: { state: 'done', content_item_id: result.content_item_id },
      }));
    } catch (e) {
      setDrafts((d) => ({
        ...d,
        [idx]: { state: 'failed', error: e instanceof Error ? e.message : String(e) },
      }));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
      >
        Query 矩阵
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12"
          onClick={() => !proposing && setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-4">
              <h3 className="text-lg font-semibold">Query 选题矩阵</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                告诉系统用户在豆包搜什么,系统反推一套能让豆包答案引用你的内容矩阵(覆盖 P2-P4)。每条都可以一键生成 AI 草稿。
              </p>
            </header>

            {/* Step 1 — Query input */}
            {!matrix ? (
              <form onSubmit={onPropose} className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium">豆包搜索 query</span>
                  <input
                    name="query"
                    type="text"
                    required
                    minLength={4}
                    placeholder="例:昆明种植牙哪家好"
                    disabled={proposing}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium">目标受众</span>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    disabled={proposing}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {AUDIENCE_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                {proposeErr ? (
                  <p className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-3 py-2 text-xs text-rose-300">
                    {proposeErr}
                  </p>
                ) : null}
                {proposing ? (
                  <p className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2 text-xs text-emerald-300">
                    AI 在思考矩阵布局…通常 30-60 秒。
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      reset();
                    }}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={proposing}
                    className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {proposing ? '生成中…' : '生成矩阵建议'}
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2 — Matrix display */
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">基于豆包 query</span>{' '}
                  <span className="font-medium">「{matrix.query}」</span>
                  <span className="ml-2 text-muted-foreground">受众</span>{' '}
                  <span className="font-medium">{matrix.audience}</span>
                </div>

                <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
                  {matrix.ideas.map((idea, i) => {
                    const status = drafts[i] ?? { state: 'idle' as const };
                    return (
                      <li
                        key={i}
                        className="rounded-md border border-border bg-background px-3 py-2.5"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${TIER_BG[idea.tier]}`}
                          >
                            {TIER_LABEL[idea.tier]}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {PLATFORM_LABEL[idea.platform]}
                          </span>
                          {idea.recommended_doctor ? (
                            <span className="text-[11px] text-muted-foreground">
                              · 推荐 {idea.recommended_doctor}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium">{idea.title}</p>
                        {idea.angle ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{idea.angle}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-end gap-2">
                          {status.state === 'done' ? (
                            <a
                              href={`/t/${tenantSlug}/content/${status.content_item_id}`}
                              className="text-xs text-emerald-400 hover:underline"
                            >
                              ✓ 已生成,点击查看 →
                            </a>
                          ) : status.state === 'failed' ? (
                            <span className="text-xs text-rose-300">{status.error}</span>
                          ) : null}
                          <button
                            type="button"
                            disabled={status.state === 'pending' || status.state === 'done'}
                            onClick={() => onCreateDraft(i, idea)}
                            className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                          >
                            {status.state === 'pending'
                              ? '生成中… 60-90s'
                              : status.state === 'done'
                              ? '已生成'
                              : '生成此条草稿'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex justify-between gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    重新提一个 query
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const anyDone = Object.values(drafts).some((d) => d.state === 'done');
                      setOpen(false);
                      reset();
                      if (anyDone) router.refresh();
                    }}
                    className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-85"
                  >
                    完成
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
