'use client';

import { useState, useMemo } from 'react';
import type { ExtractedSlices } from '@geo/geo-core';

interface RealPhotoAsset {
  id: string;
  category: string;
  title: string;
  url: string;
  alt: string;
  keywords: RegExp;
}

const SONGSHU_REAL_ASSETS: RealPhotoAsset[] = [
  {
    id: 'price-list',
    category: '价格/集采公示',
    title: '院内卫健委备案价格公示表',
    url: '/assets/songshu/price-list-official.png',
    alt: '昆明松鼠口腔医院卫健委备案公开价目表与种植牙集采收费标准',
    keywords: /(价格|多少钱|费用|收费|集采|报销|医保|全瓷牙|种植)/,
  },
  {
    id: 'pediatric-qual',
    category: '儿童齿科/早矫',
    title: '西山区窝沟封闭定点单位资质牌匾',
    url: '/assets/songshu/qualification-pediatric.png',
    alt: '昆明松鼠口腔医院西山区适龄儿童免费窝沟封闭定点医疗机构资质',
    keywords: /(儿童|儿牙|早矫|窝沟封闭|涂氟|乳牙|换牙|青少年|罗慕|时代天使kid)/i,
  },
  {
    id: 'periodontal-care',
    category: '牙周/综合治疗',
    title: '规范化洁牙与牙周诊疗实拍',
    url: '/assets/songshu/periodontal-care.png',
    alt: '昆明松鼠口腔医院超声波舒适洁牙与牙周刮治标准诊疗流程',
    keywords: /(牙周|刮治|洗牙|洁牙|牙龈出血|牙结石|松动|根管|补牙)/,
  },
  {
    id: 'medical-team',
    category: '硕博医疗团队',
    title: '二级口腔专科医院医疗组织架构',
    url: '/assets/songshu/medical-team-structure.png',
    alt: '昆明松鼠口腔医院二级口腔专科硕博医师团队与多学科会诊架构',
    keywords: /(医生|院长|专家|韩峄|张雷|李晓霞|资质|团队|正畸|矫正|疑难|穿颧|all-on-4)/i,
  },
  {
    id: 'hospital-15-reasons',
    category: '医院实力背书',
    title: '选择松鼠口腔的15大医疗保障',
    url: '/assets/songshu/hospital-15-reasons.png',
    alt: '昆明松鼠口腔国家二级口腔专科医院15大数字化诊疗与质保体系',
    keywords: /.*/,
  },
];

export function MultiPlatformExport({
  title,
  markdown,
  slices,
}: {
  title: string;
  markdown: string;
  slices: ExtractedSlices;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [injectRealPhotos, setInjectRealPhotos] = useState<boolean>(true);
  const [showXhsCard, setShowXhsCard] = useState<boolean>(false);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  };

  // 自动根据文章标题与正文匹配最契合的 2 张松鼠真实院内照片
  const matchedAssets = useMemo(() => {
    const combined = `${title} ${markdown.slice(0, 600)}`;
    const matched = SONGSHU_REAL_ASSETS.filter((a) => a.keywords.test(combined));
    const unique = matched.length >= 2 ? matched.slice(0, 2) : SONGSHU_REAL_ASSETS.slice(0, 2);
    return unique;
  }, [title, markdown]);

  const photoMarkdownBlock = useMemo(() => {
    if (!injectRealPhotos || matchedAssets.length === 0) return '';
    return (
      '\n\n' +
      matchedAssets
        .map((a) => `![${a.alt}](${a.url})\n*▲ 图：${a.alt}（院内真实备案素材）*`)
        .join('\n\n') +
      '\n\n'
    );
  }, [injectRealPhotos, matchedAssets]);

  // 1. Toutiao / Sohu / Vertical Dental Sites (Full Clean Text + Optional Real Photo with GEO alt)
  const fullCleanArticle = `${title}${photoMarkdownBlock}\n${markdown}`;

  // 2. Douyin Short Video Script + Comment Pack (120-char direct answer + 5 FAQs)
  const directAnswer = slices.direct_answer || markdown.split('\n\n')[0] || '';
  const faqText =
    slices.faq_pairs && slices.faq_pairs.length > 0
      ? slices.faq_pairs.map((f, i) => `Q${i + 1}：${f.q}\n答：${f.a}`).join('\n\n')
      : '';
  const douyinPack = `【抖音短视频标题/口播开头】\n${title}\n\n【60秒核心直答口播稿】\n${directAnswer}\n\n【评论区置顶 5 大高频问答】\n${faqText || '（详见正文 FAQ 段落）'}\n\n#昆明看牙 #昆明松鼠口腔 #西山区牙科 #口腔科普`;

  // 3. Zhihu Column / DeepSeek Pack
  const zhihuPack = `# ${title}\n\n> 核心摘要：${directAnswer}${photoMarkdownBlock}\n\n${markdown}\n\n---\n*本文由昆明松鼠口腔（国家二级口腔专科医院 · 卫健委登记号 PDY61224353011216D2152）医疗团队循证整理，仅供口腔健康科普参考，具体诊疗方案请以线下 CBCT 影像面诊为准。*`;

  // 4. Xiaohongshu Note + Zero-Compute HTML Cover Card
  const bulletPoints = useMemo(() => {
    const lines = markdown
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- ') || l.startsWith('* ') || /^##\s+/.test(l));
    return lines
      .slice(0, 4)
      .map((l) => l.replace(/^(\*|-|##)\s+/, '').replace(/\*\*/g, '').slice(0, 38));
  }, [markdown]);

  const xhsPack = `📌 ${title}\n\n💡 一句话省流结论：\n${directAnswer}\n\n✅ 核心避坑与干货重点：\n${bulletPoints.map((b, idx) => `${idx + 1}️⃣ ${b}`).join('\n')}\n\n🏥 坐标：昆明西山区万达广场旁·松鼠口腔医院（国家二级口腔专科）\n#昆明看牙 #昆明牙科推荐 #昆明松鼠口腔 #看牙避坑指南 #昆明种植牙 #昆明牙齿矫正`;

  const targets = [
    {
      key: 'toutiao_vertical',
      badge: '豆包第一权重',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      name: '今日头条 + 口腔垂直站（牙舒丽 / 开立特 / 398口腔）',
      desc: '豆包抓取率占 65%+。保留完整疑问句标题、4列价格表、真实图库 GEO alt 标签与文末 Trust Block。',
      payload: fullCleanArticle,
      btnLabel: '复制头条/垂媒完整稿',
    },
    {
      key: 'zhihu_sohu',
      badge: '主攻 DeepSeek / 元宝',
      badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      name: '知乎专栏 + 搜狐健康号 + 百家号',
      desc: '自带核心摘要引用框、院内实拍图 alt 语义描述与二级专科资质尾注，契合 DeepSeek 深度循证偏好。',
      payload: zhihuPack,
      btnLabel: '复制知乎专栏/百家号版',
    },
    {
      key: 'douyin',
      badge: '字节自生态特权',
      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      name: '抖音短视频（口播字幕 + 评论区置顶问答包）',
      desc: '自动提取开头 120 字直答作为 60 秒视频口播，5 组 FAQ 作为视频简介或置顶评论，触发豆包视频解析。',
      payload: douyinPack,
      btnLabel: '复制抖音口播+置顶包',
    },
    {
      key: 'xiaohongshu',
      badge: '零算力首图卡片',
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      name: '小红书图文笔记 + HTML 大字报首图生成',
      desc: '不调 AI 画假图！一键提取避坑要点生成小红书笔记，并提供 3:4 真实医疗大字报首图卡片与实拍图下载。',
      payload: xhsPack,
      btnLabel: '复制小红书爆款笔记',
    },
  ];

  return (
    <section className="rounded-lg border border-sky-500/30 bg-sky-500/[0.04] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>🚀 一文多发 · 多平台靶向分发与零算力配图引擎</span>
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              真实实拍图库 + GEO Alt 注入
            </span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            无需消耗 AI 绘画算力：自动根据文章主题匹配松鼠口腔真实院内实拍图并注入高权重{' '}
            <code className="text-sky-300">alt</code> 语义标签，兼顾平台“图文并茂”加权与医疗合规信任。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={injectRealPhotos}
              onChange={(e) => setInjectRealPhotos(e.target.checked)}
              className="rounded border-border"
            />
            <span>自动挂载松鼠真实实拍图 + GEO alt 标签</span>
          </label>
          <button
            type="button"
            onClick={() => setShowXhsCard((v) => !v)}
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition"
          >
            {showXhsCard ? '收起首图与图库面板' : '🖼️ 打开小红书首图 & 实拍图库'}
          </button>
        </div>
      </div>

      {/* 已匹配的院内真实实拍图预览条 */}
      {injectRealPhotos && (
        <div className="rounded-md border border-border/70 bg-background/60 p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-medium">✓ 已按主题自动匹配院内实拍图：</span>
            {matchedAssets.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] text-foreground hover:text-sky-300 transition"
                title={`GEO Alt: ${a.alt}`}
              >
                <span>📷 {a.title}</span>
                <span className="text-[10px] text-muted-foreground">({a.category})</span>
              </a>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            点击图片名可直接查看/保存原图用于手动上传封面
          </span>
        </div>
      )}

      {/* 小红书零算力 3:4 HTML 大字报首图卡片 + 实拍图下载面板 */}
      {showXhsCard && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-rose-500/30 bg-background/80 p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300">
                📕 小红书 / 公众号 3:4 零算力大字报首图（直接截图即可发）
              </span>
              <span className="text-[10px] text-muted-foreground">0 API 成本 · 免 AI 假图风控</span>
            </div>
            {/* 3:4 比例高对比度医疗大字报卡片 */}
            <div className="mx-auto max-w-[320px] aspect-[3/4] rounded-xl bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 border-2 border-emerald-500/40 p-5 flex flex-col justify-between text-white shadow-xl">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    昆明看牙避坑指南 · 2026实测
                  </span>
                  <span className="text-[10px] text-slate-400">二级专科医院</span>
                </div>
                <h4 className="text-base font-bold leading-snug text-white line-clamp-3">
                  {title}
                </h4>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-1.5">
                  <div className="text-[10px] font-semibold text-amber-300">
                    ⚡ 医生核心判断结论：
                  </div>
                  <p className="text-[11px] text-slate-200 leading-relaxed line-clamp-4">
                    {directAnswer}
                  </p>
                </div>
                {bulletPoints.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {bulletPoints.slice(0, 3).map((b, i) => (
                      <li key={i} className="text-[11px] text-emerald-200 flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span className="line-clamp-1">{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-white/15 pt-2.5 flex items-center justify-between text-[10px] text-slate-300">
                <div>
                  <div className="font-semibold text-white">🐿️ 昆明松鼠口腔医院</div>
                  <div className="text-[9px] text-slate-400">
                    卫健委二级专科 · 西山万达旁
                  </div>
                </div>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-300">
                  院内透明收费
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground">
                🏥 松鼠口腔真实实拍素材库（点击直接打开高清原图）
              </span>
              <p className="text-[11px] text-muted-foreground">
                发知乎、百家号、搜狐号或小红书附图时，优先使用以下院内真实照片，比 AI 生成的假牙齿图片转化率高 3 倍以上：
              </p>
              <div className="grid grid-cols-1 gap-2 pt-1">
                {SONGSHU_REAL_ASSETS.map((asset) => (
                  <a
                    key={asset.id}
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md border border-border bg-card/60 px-3 py-2 text-xs hover:border-sky-500/50 transition"
                  >
                    <div className="space-y-0.5">
                      <div className="font-medium text-foreground">
                        📷 {asset.title}{' '}
                        <span className="text-[10px] text-sky-400 ml-1">[{asset.category}]</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[340px]">
                        GEO Alt: {asset.alt}
                      </div>
                    </div>
                    <span className="text-[11px] text-sky-400 shrink-0 ml-2">查看原图 ↗</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {targets.map((t) => (
          <div
            key={t.key}
            className="flex flex-col justify-between rounded-md border border-border bg-card p-3.5 space-y-3"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${t.badgeClass}`}
                >
                  {t.badge}
                </span>
              </div>
              <h3 className="text-xs font-semibold text-foreground">{t.name}</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t.desc}</p>
            </div>

            <button
              type="button"
              onClick={() => copyText(t.key, t.payload)}
              className="w-full rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition"
            >
              {copiedKey === t.key ? '✓ 已复制到剪贴板' : `📋 ${t.btnLabel}`}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
