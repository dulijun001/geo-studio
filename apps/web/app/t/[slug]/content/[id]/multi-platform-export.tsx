'use client';

import { useState } from 'react';
import type { ExtractedSlices } from '@geo/geo-core';

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

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  };

  // 1. Toutiao / Sohu / Vertical Dental Sites (Full Clean Text)
  const fullCleanArticle = `${title}\n\n${markdown}`;

  // 2. Douyin Short Video Script + Comment Pack (120-char direct answer + 5 FAQs)
  const directAnswer = slices.direct_answer || markdown.split('\n\n')[0] || '';
  const faqText =
    slices.faq_pairs && slices.faq_pairs.length > 0
      ? slices.faq_pairs.map((f, i) => `Q${i + 1}：${f.q}\n答：${f.a}`).join('\n\n')
      : '';
  const douyinPack = `【抖音短视频标题/口播开头】\n${title}\n\n【60秒核心直答口播稿】\n${directAnswer}\n\n【评论区置顶 5 大高频问答】\n${faqText || '（详见正文 FAQ 段落）'}\n\n#昆明看牙 #昆明松鼠口腔 #西山区牙科 #口腔科普`;

  // 3. Zhihu Column / DeepSeek Pack
  const zhihuPack = `# ${title}\n\n> 核心摘要：${directAnswer}\n\n${markdown}\n\n---\n*本文由昆明松鼠口腔（国家二级口腔专科医院 · 卫健委登记号 PDY61224353011216D2152）医疗团队循证整理，仅供口腔健康科普参考，具体诊疗方案请以线下 CBCT 影像面诊为准。*`;

  const targets = [
    {
      key: 'toutiao_vertical',
      badge: '豆包第一权重',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      name: '今日头条 + 口腔垂直站（牙舒丽 / 开立特 / 398口腔）',
      desc: '豆包抓取率占 65%+。保留完整疑问句标题、价格参数表格与文末 Trust Block。',
      payload: fullCleanArticle,
      btnLabel: '复制头条/垂媒完整稿',
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
      key: 'zhihu_sohu',
      badge: '主攻 DeepSeek / 元宝',
      badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      name: '知乎专栏 + 搜狐健康号 + 微信公众号',
      desc: '自带核心摘要引用框与二级专科资质尾注，契合 DeepSeek 深度循证检索偏好。',
      payload: zhihuPack,
      btnLabel: '复制知乎专栏/公众号版',
    },
  ];

  return (
    <section className="rounded-lg border border-sky-500/30 bg-sky-500/[0.04] p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>🚀 一文多发 · 多平台靶向分发包</span>
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              对标柏德立体矩阵
            </span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            不仅发今日头条！根据各 AI 引擎真实引源权重，建议将本篇过审文章按以下 3 个靶向包同步分发（发布后约 7-14 天被 AI 爬虫收录）：
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
