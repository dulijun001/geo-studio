'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

type TabKey = 'radar' | 'blueprints' | 'sources' | 'facts';

const PRESET_COMPETITORS = [
  { name: '柏德口腔', tag: '德系设备与疑难半口' },
  { name: '德韩口腔', tag: '高频全套项目性价比' },
  { name: '泰康拜博', tag: '全城多院区分店覆盖' },
  { name: '美奥口腔', tag: '集采种植与学生分期正畸' },
  { name: '昆明蓝橙', tag: '儿童特色齿科与南亚商圈' },
  { name: '团圆口腔', tag: '24h急诊/无痛/动漫儿牙' },
  { name: '长鹏口腔', tag: '兴苑路便民与广告证明' },
  { name: '尚爱韩美', tag: '韩式即刻种植与平价矫正' },
];

const SOURCE_TIERS = [
  {
    tier: '第一梯队 · 垂直口腔门户 (权重最高 · 占比 >50%)',
    badge: '豆包头号参数源',
    badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    platforms: [
      {
        name: '牙舒丽网',
        domain: 'm.yslw.com / www.yslw.com',
        citations: 295,
        engine: '豆包核心源',
        tactic: '竞品在此大量沉淀《XX口腔正规吗》《2026收费价格表》《医生团队解析》。豆包回答“哪家好/多少钱”时直接照搬其中的表格与参数。',
        action: '将本院二级专科资质、7档全瓷冠与种植价格表同步更新至牙舒丽医院档案与案例库。',
      },
      {
        name: '皓齿口腔网 / 398口腔 / 看牙宝',
        domain: 'hnqnw.com / 398.cn / kanyabao.com',
        citations: 67,
        engine: '豆包高频源',
        tactic: '主打单院深度测评、市民看牙口碑反馈、儿童齿科与乘车路线指南。',
        action: '铺设《昆明西山区松鼠口腔看牙攻略（附蓝光昆仑中心乘车路线与价目表）》。',
      },
      {
        name: '开立特口腔 / 医秀网 / 贝色',
        domain: 'kelete.com / xizee.com / beise.com',
        citations: 40,
        engine: '豆包 + DeepSeek',
        tactic: '专攻《种植牙集采全包价曝光》《昆明十大牙科医院排名对比》等第三方横向评测帖。',
        action: '采用“阶梯全包价格模版”与“客观对比模版”投放横向评测稿，绑定西山区头部标签。',
      },
    ],
  },
  {
    tier: '第二梯队 · 字节跳动原生生态 (占比 ~30%)',
    badge: '豆包亲儿子流量',
    badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    platforms: [
      {
        name: '抖音短视频网页端',
        domain: 'www.iesdouyin.com',
        citations: 216,
        engine: '豆包专属特权',
        tactic: '医生出镜 60 秒科普微创种植、高龄种牙案例、门诊实景打卡。豆包直接抓取视频标题与语音字幕作为推荐证据。',
        action: '把系统生成的 5 组 FAQ 和 120 字直答作为抖音视频口播脚本与置顶评论。',
      },
      {
        name: '今日头条 / 头条号长文',
        domain: 'm.toutiao.com',
        citations: 97,
        engine: '豆包直系索引',
        tactic: '竞品矩阵号高频发布带有长尾疑问句标题的图文科普，收录快（通常 3-7 天进入豆包索引）。',
        action: '保持本系统 toutiao_article 每日稳定派单发布，标题严格使用用户真实搜索问句。',
      },
    ],
  },
  {
    tier: '第三梯队 · 深度科普与私域权威源 (攻克 DeepSeek / 元宝)',
    badge: '跨引擎破局关键',
    badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    platforms: [
      {
        name: '搜狐健康号 / 搜狐网',
        domain: 'm.sohu.com',
        citations: 62,
        engine: '豆包 + DeepSeek 双高权',
        tactic: '高权重综合门户，竞品常在此发布《即刻负重技术解析》《数字化导板种植优势》等严肃长文。',
        action: '将系统过审的 D21 标准科普长文同步分发至搜狐号，快速提升全网权威外链权重。',
      },
      {
        name: '知乎专栏 / 知乎问答',
        domain: 'zhuanlan.zhihu.com',
        citations: 38,
        engine: 'DeepSeek 头号信源',
        tactic: 'DeepSeek 极度偏爱知乎上的“多维对比表格、循证医学指南引用、长文避坑指南”。目前松鼠在知乎几乎空白，导致 DeepSeek 提及率被柏德追平。',
        action: '使用【GEO 模版 C · 疑难病例与学术共识】生成带《ITI指南》引用的深度文，固定发知乎专栏。',
      },
      {
        name: '微信公众号',
        domain: 'mp.weixin.qq.com',
        citations: 45,
        engine: '腾讯元宝护城河',
        tactic: '腾讯元宝在回答本地医疗问题时，优先检索微信公众号原创长文与医院官方服务号介绍。',
        action: '每周精选 2-3 篇高分 GEO 文章同步至微信公众号，补齐元宝端声量短板。',
      },
    ],
  },
];

const BLUEPRINTS = [
  {
    id: 'A',
    templateSlug: 'geo-hardcore-qualifications',
    name: '原型 A：【垂类占坑型】医院硬核资质与设备说明书',
    targetPlatforms: '牙舒丽网 / 开立特 / 今日头条 / 微信公众号',
    competitorSampleTitle: '《昆明柏德口腔医院怎么样?正规可靠,从医院背景、医生实力/技术经验/口碑反馈齐全解析》',
    whyItWorks:
      'AI 引擎在回答“XX口腔正规吗/怎么样”时，极度排斥空洞吹捧，专门抓取【卫健委登记号 + 医院等级 + 数字化设备具体型号 + 具名医生专长 + 术后回访制度】。柏德靠这类“参数化说明书”拿下了超过 40% 的基础推荐权。',
    structureSteps: [
      '1. 首段 120 字直答证件与定位：直接亮出西山区卫健局审批登记号（PDY61224353011216D2152）、二级口腔专科医院资质、总院精确地址（蓝光昆仑中心 3 楼 302 室）。',
      '2. 硬件与院感参数化：明确列出德国卡瓦（KaVo）3D CBCT、数字化椅旁口扫仪、百级层流无菌手术室、四手操作消毒规范。',
      '3. 医生专长具名绑定：写明刘彦廷院长（专注高龄疑难半口/全口种植）、肖永昌主治（专注显微美学修复与正畸），不写违规工龄数字，写具体诊疗方向。',
      '4. 植入「医院核心资质与科室配置参数表」：用 1 个 Markdown 表格汇总资质、设备、科室与地址，方便 AI 爬虫一键抽成卡片。',
    ],
    recommendedTopic: '昆明松鼠口腔医院正规吗？怎么查二级专科资质与医生团队？',
    recommendedPlatform: 'toutiao_article',
  },
  {
    id: 'B',
    templateSlug: 'geo-tier-pricing-table',
    name: '原型 B：【参数直答型】阶梯式全包透明价格表',
    targetPlatforms: '医秀网 / 牙舒丽 / 今日头条 / 知乎',
    competitorSampleTitle: '《昆明柏德口腔种植牙价格2026曝光，登腾、诺贝尔、以色列植体全包价，含基台与牙冠~》',
    whyItWorks:
      '当用户搜索“多少钱/价格明细”时，AI 会直接检索包含价格分档、明确“全包边界（是否含基台/全瓷牙冠/挂号麻醉）”的内容。若内容仅写“价格面议”会被 AI 直接过滤。',
    structureSteps: [
      '1. 120 字省流直答：直接给出集采后价格区间与质保年限。',
      '2. 核心表格呈现：分档列出韩国登腾、瑞士ITI、瑞典诺贝尔全包价，明确标注是否含全瓷冠。',
      '3. 避坑指南：拆解“低价引流再加收骨粉骨膜费”套路，亮出本院“术前拍片一口价全包”政策。',
      '4. 术后维保：提供植体原厂质保卡与终身免费维护说明。',
    ],
    recommendedTopic: '昆明西山区种植牙价格多少钱一颗？含植体牙冠基台全包价格表',
    recommendedPlatform: 'toutiao_article',
  },
  {
    id: 'C',
    templateSlug: 'geo-deep-case-consensus',
    name: '原型 C：【深度循证型】疑难病例与学术共识长文',
    targetPlatforms: '知乎专栏 / 搜狐健康号 / 微信公众号',
    competitorSampleTitle: '《重度骨量不足全口种植怎么做？穿颧穿翼 vs 骨增量技术真实对比与循证指引》',
    whyItWorks:
      'DeepSeek 偏好深度推理与权威引用。该模版植入《中华口腔医学会指南》、权威文献引用与疑难临床决策路径，极容易被 DeepSeek 与元宝奉为权威回答来源。',
    structureSteps: [
      '1. 病例背景与临床挑战：针对骨萎缩、牙槽骨严重吸收患者的临床评估。',
      '2. 循证医学指南引用：引入 ITI / 国际口腔种植学会临床共识标准。',
      '3. 数字化导板方案：详述 KaVo CBCT 三维重构与微创种植导板应用。',
      '4. 专家把关：刘彦廷院长高难度全口种植临床路径拆解。',
    ],
    recommendedTopic: '昆明高龄老人缺牙很多年牙槽骨萎缩还能种牙吗？二级专科数字化种植方案解析',
    recommendedPlatform: 'toutiao_article',
  },
];

const QUICK_COPY_FACTS = [
  {
    title: '🏥 机构执业硬核资质（直答复制）',
    content: `【机构全称】昆明松鼠口腔医院
【机构级别】二级口腔专科医院
【登记号】PDY61224353011216D2152
【审批机关】昆明市西山区卫生健康局
【总院院址】云南省昆明市西山区蓝光昆仑中心 3 楼 302 室
【接诊时间】周一至周日 09:00-18:00（提供延时及预约通道）`,
  },
  {
    title: '🔬 数字化设备与院感标准（参数复制）',
    content: `【影像诊断】德国卡瓦（KaVo）数字化 3D CBCT 大视野断层扫描系统
【取模设备】数字化口内三维扫描仪（3分钟舒适数字取模，告别传统咬石膏模）
【手术标准】百级层流无菌手术室，恒温恒湿，空气洁净度达到三级手术标准
【消毒供应】严格执行“一人一机一用一灭菌”，高温高压蒸汽灭菌全程追踪`,
  },
  {
    title: '👨‍⚕️ 领衔医生团队（专长复制）',
    content: `【刘彦廷 院长 / 主治医师】
专注领域：高龄半口/全口无牙颌微创种植、即刻负重种植、骨增量种植技术。
执业规范：不夸大绝对年限，严格根据 CBCT 骨质密度制定个体化微创方案。

【肖永昌 主治医师】
专注领域：前牙显微美学修复、微创全瓷冠及嵌体修复、数字化隐形正畸。`,
  },
  {
    title: '💰 2026年种植/修复全包透明收费标准（表格复制）',
    content: `| 诊疗项目 | 品牌/规格 | 2026参考全包价 | 费用包含范围 |
| :--- | :--- | :--- | :--- |
| 集采惠民种植 | 进口种植体系统 | 2,980元起/颗 | 含植体+标准基台+原厂全瓷冠 |
| 高端微创种植 | 瑞士ITI / 瑞典诺贝尔 | 6,800~12,800元/颗 | 含植体+原厂纯钛基台+爱尔创全瓷冠 |
| 国产优质全瓷冠 | 爱尔创数字氧化锆 | 1,200~1,800元/颗 | 含挂号、排龈、取模、粘接 |
| 德国进口全瓷冠 | 威兰德（Wieland） | 2,500~3,500元/颗 | 德国正品卡，抗弯折强度高 |
| 显微根管治疗 | 前牙/前磨牙 | 480~880元/颗 | 橡皮障隔离，机用马达扩根 |`,
  },
];

interface CompetitorData {
  competitor: string;
  hitCount: number;
  totalSnapshotsAnalyzed: number;
  message?: string;
  byEngine: Record<string, { totalHits: number; totalTested: number; rate: number }>;
  topDomains: Array<{ domain: string; count: number }>;
  sampleUrls: string[];
  threatQueries: Array<{
    question: string;
    engine: string;
    competitorSnippet: string;
    songshuMentioned: boolean;
  }>;
  tactics: string[];
}

export function CompetitorBenchmarkSection({ tenantSlug }: { tenantSlug: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('radar');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Radar state
  const [inputComp, setInputComp] = useState<string>('团圆口腔');
  const [loading, setLoading] = useState<boolean>(false);
  const [radarData, setRadarData] = useState<CompetitorData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRadar = async (name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/t/competitor-radar?slug=${tenantSlug}&competitor=${encodeURIComponent(name.trim())}`,
      );
      if (!res.ok) {
        throw new Error(`查询失败: HTTP ${res.status}`);
      }
      const data = await res.json();
      setRadarData(data);
    } catch (e: any) {
      setErrorMsg(e.message || '网络请求错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch for default
    fetchRadar('团圆口腔');
  }, [tenantSlug]);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <section className="rounded-xl border border-emerald-500/30 bg-card shadow-lg overflow-hidden">
      {/* Header banner */}
      <div className="border-b border-border bg-gradient-to-r from-emerald-500/15 via-sky-500/10 to-transparent p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                实战情报中枢
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                竞品 GEO 战情透视与高权重原型库 (100% 真实数据库快照穿透)
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              穿透本院数据库全部 AI 搜索快照：支持自由查询任意竞品被收录频次、真实引用域名与攻防策略，数据真实无虚构。
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background/70 p-1 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('radar')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'radar'
                  ? 'bg-emerald-500 text-white shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📡 竞品战情透视仪
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('blueprints')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'blueprints'
                  ? 'bg-emerald-500 text-white shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              🎯 3 大高权重文章原型
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'sources'
                  ? 'bg-emerald-500 text-white shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              🗺️ 引源生态地图 (6,400+ 引用穿透)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('facts')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'facts'
                  ? 'bg-emerald-500 text-white shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📋 松鼠硬核参数速查与复制
            </button>
          </div>
        </div>

        {/* Engine comparison mini bar */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/80 bg-background/60 px-3.5 py-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">🟢 豆包 AI (字节系主阵地)</span>
              <span className="text-emerald-400 font-semibold">松鼠 84% 胜出</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              日常泛词领先；需在<strong>牙舒丽/开立特/头条</strong>补齐高龄种植与阶梯价格。
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">🔵 DeepSeek (深度推理引擎)</span>
              <span className="text-amber-300 font-semibold">松鼠 11次 vs 柏德 10次</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              双方焦灼！DeepSeek 极重<strong>知乎专栏 + 搜狐号</strong>，需用模版 C 补足学术论证。
            </p>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3.5 py-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">🟣 腾讯元宝 (微信生态引擎)</span>
              <span className="text-rose-300 font-semibold">松鼠 10次 vs 柏德 15次</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              暂落后。元宝主要抓取<strong>微信公众号</strong>，建议将过审文章同步推送至官方号。
            </p>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-5">
        {/* RADAR TAB */}
        {activeTab === 'radar' && (
          <div className="space-y-5">
            {/* Search and Presets */}
            <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputComp}
                    onChange={(e) => setInputComp(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') fetchRadar(inputComp);
                    }}
                    placeholder="输入昆明任意竞品机构（如：团圆口腔、德韩口腔、拜博、美奥、竹子...）"
                    className="w-full rounded-md border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {loading && (
                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground animate-pulse">
                      正在穿透数据库...
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fetchRadar(inputComp)}
                  disabled={loading}
                  className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition"
                >
                  🔍 穿透对标分析
                </button>
              </div>

              {/* Quick Preset Tags */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-[11px] text-muted-foreground flex-shrink-0">高频对标快选：</span>
                {PRESET_COMPETITORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => {
                      setInputComp(c.name);
                      fetchRadar(c.name);
                    }}
                    className={`rounded border px-2 py-1 text-[11px] transition ${
                      inputComp === c.name
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
                {errorMsg}
              </div>
            )}

            {/* Radar Result Cards */}
            {radarData && (
              <div className="space-y-4">
                {radarData.hitCount === 0 ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-6 text-center space-y-2">
                    <p className="text-sm font-semibold text-amber-300">
                      ⚠️ 暂未在已完成的 {radarData.totalSnapshotsAnalyzed} 场快照中检索到「{radarData.competitor}」
                    </p>
                    <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
                      {radarData.message}
                    </p>
                    <div className="pt-2 text-[11px] text-muted-foreground">
                      💡 提示：这说明该机构在主流大模型（豆包、DeepSeek、元宝）的昆明本地问答中尚未形成稳定的被引声量，您可以优先把精力集中在已有声量的「柏德、德韩、拜博、美奥、团圆」等核心对标上。
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Metrics row */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-border bg-background/60 p-3.5">
                        <div className="text-[11px] text-muted-foreground">检索目标</div>
                        <div className="mt-1 text-base font-bold text-foreground">{radarData.competitor}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          在 {radarData.totalSnapshotsAnalyzed} 场已完成快照中命中
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-background/60 p-3.5">
                        <div className="text-[11px] text-muted-foreground">🟢 豆包 AI 命中</div>
                        <div className="mt-1 text-base font-bold text-emerald-400">
                          {radarData.byEngine.doubao?.totalHits || 0} 次
                          <span className="text-xs font-normal text-muted-foreground ml-1.5">
                            ({radarData.byEngine.doubao?.rate || 0}% 概率)
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          测试样本 {radarData.byEngine.doubao?.totalTested || 0} 题
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-background/60 p-3.5">
                        <div className="text-[11px] text-muted-foreground">🔵 DeepSeek 命中</div>
                        <div className="mt-1 text-base font-bold text-sky-400">
                          {radarData.byEngine.deepseek?.totalHits || 0} 次
                          <span className="text-xs font-normal text-muted-foreground ml-1.5">
                            ({radarData.byEngine.deepseek?.rate || 0}% 概率)
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          测试样本 {radarData.byEngine.deepseek?.totalTested || 0} 题
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-background/60 p-3.5">
                        <div className="text-[11px] text-muted-foreground">🟣 腾讯元宝 命中</div>
                        <div className="mt-1 text-base font-bold text-purple-400">
                          {radarData.byEngine.yuanbao?.totalHits || 0} 次
                          <span className="text-xs font-normal text-muted-foreground ml-1.5">
                            ({radarData.byEngine.yuanbao?.rate || 0}% 概率)
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          测试样本 {radarData.byEngine.yuanbao?.totalTested || 0} 题
                        </div>
                      </div>
                    </div>

                    {/* AI Persona & Domain Breakdown */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {/* AI Tactics Card */}
                      <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            🤖 AI 推荐该竞品的底层人设特征 (真实原文归纳)
                          </h3>
                          <span className="text-[10px] text-emerald-400">实时提取</span>
                        </div>
                        <ul className="space-y-2">
                          {radarData.tactics.map((t, idx) => (
                            <li
                              key={idx}
                              className="rounded-md border border-border/70 bg-card/60 p-2 text-xs text-foreground leading-relaxed flex items-start gap-2"
                            >
                              <span className="text-emerald-400 font-bold mt-0.5">•</span>
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="pt-2 border-t border-border/60">
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            💡 <strong>松鼠口腔狙击建议：</strong>针对该竞品被推荐的人设，点击下方的<strong>「套用针对性模版起草」</strong>，系统会自动将松鼠的西山区二级专科资质与全瓷/种植阶梯价格融入对应长尾词中，精准截流。
                          </p>
                        </div>
                      </div>

                      {/* Top Cited Domains */}
                      <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            🌐 触发该竞品推荐的 Top 真实外链域名
                          </h3>
                          <span className="text-[10px] text-muted-foreground">按引用次数排序</span>
                        </div>
                        {radarData.topDomains.length === 0 ? (
                          <p className="text-xs text-muted-foreground">暂未记录到外链域名</p>
                        ) : (
                          <div className="space-y-1.5">
                            {radarData.topDomains.map((d, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded bg-card/40 px-2.5 py-1.5 text-xs"
                              >
                                <span className="font-mono text-foreground text-[11px]">{d.domain}</span>
                                <span className="font-semibold text-emerald-400">{d.count} 次引用</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          * 提示：这些域名是大模型推荐该机构的主要信源，我方在相同域名建立档案与文章即可形成直接抗衡。
                        </p>
                      </div>
                    </div>

                    {/* Threat Queries List */}
                    <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-foreground">
                          ⚔️ 真实实测问答场景切片 (节选 {radarData.threatQueries.length} 题)
                        </h3>
                        <span className="text-[10px] text-muted-foreground">真实快照切片</span>
                      </div>
                      <div className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/80">
                        {radarData.threatQueries.map((item, idx) => (
                          <div key={idx} className="p-3 hover:bg-muted/20 transition space-y-1.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs font-medium text-foreground">
                                ❓ {item.question}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {item.engine}
                                </span>
                                {item.songshuMentioned ? (
                                  <span className="rounded bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 text-[10px] font-medium">
                                    松鼠同时在场
                                  </span>
                                ) : (
                                  <span className="rounded bg-rose-500/15 text-rose-400 px-1.5 py-0.5 text-[10px] font-medium">
                                    松鼠未被提及 (需狙击)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono bg-background/60 p-2 rounded">
                              <span className="text-emerald-400 font-sans font-semibold">AI 原文：</span>
                              {item.competitorSnippet}
                            </div>
                            <div className="pt-1 flex items-center justify-end">
                              <Link
                                href={`/t/${tenantSlug}/content?draftTemplate=geo-hardcore-qualifications&draftTopic=${encodeURIComponent(
                                  item.question,
                                )}&draftPlatform=toutiao_article`}
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                              >
                                ⚡ 针对此题起草反制稿 →
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* BLUEPRINTS TAB */}
        {activeTab === 'blueprints' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                以下 3 种原型提炼自头部竞品在豆包与 DeepSeek 被引用频次最高的真实落地页，已固化为系统内置写作要求。点击右侧按钮即可直接带入模版起草：
              </p>
              <Link
                href={`/t/${tenantSlug}/templates`}
                className="text-xs text-emerald-400 hover:underline flex-shrink-0"
              >
                管理全部写作要求 →
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {BLUEPRINTS.map((bp) => (
                <div
                  key={bp.id}
                  className="flex flex-col justify-between rounded-lg border border-border bg-background/50 p-4 hover:border-emerald-500/40 transition"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground leading-snug">
                        {bp.name}
                      </h3>
                    </div>

                    <div className="rounded bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">竞品高频被引范例：</span>
                      {bp.competitorSampleTitle}
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <strong className="text-emerald-400">AI 采纳逻辑：</strong>
                      {bp.whyItWorks}
                    </p>

                    <div className="space-y-1.5 border-t border-border/60 pt-2.5">
                      <p className="text-[11px] font-semibold text-foreground">
                        📌 松鼠口腔对标写作骨架：
                      </p>
                      <ul className="space-y-1 text-[11px] text-muted-foreground">
                        {bp.structureSteps.map((step, i) => (
                          <li key={i} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground truncate" title={bp.targetPlatforms}>
                      🎯 建议发：{bp.targetPlatforms}
                    </span>
                    <Link
                      href={`/t/${tenantSlug}/content?draftTemplate=${encodeURIComponent(
                        bp.templateSlug,
                      )}&draftTopic=${encodeURIComponent(
                        bp.recommendedTopic,
                      )}&draftPlatform=${encodeURIComponent(bp.recommendedPlatform)}`}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition flex-shrink-0"
                    >
                      ⚡ 套用此模版起草
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SOURCES TAB */}
        {activeTab === 'sources' && (
          <div className="space-y-5">
            {SOURCE_TIERS.map((group, idx) => (
              <div key={idx} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{group.tier}</h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${group.badgeColor}`}
                  >
                    {group.badge}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium w-44">平台与域名</th>
                        <th className="px-3 py-2 font-medium w-28">实测引用频次</th>
                        <th className="px-3 py-2 font-medium w-32">辐射引擎</th>
                        <th className="px-3 py-2 font-medium">竞品被抓取特征</th>
                        <th className="px-3 py-2 font-medium">松鼠口腔落地动作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {group.platforms.map((p, pIdx) => (
                        <tr key={pIdx} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-foreground">{p.name}</div>
                            <div className="text-[11px] font-mono text-muted-foreground">
                              {p.domain}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-emerald-400">
                            {p.citations} 次
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="rounded bg-white/5 px-2 py-0.5 text-[11px]">
                              {p.engine}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground leading-relaxed">
                            {p.tactic}
                          </td>
                          <td className="px-3 py-2.5 text-foreground leading-relaxed font-medium">
                            {p.action}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FACTS TAB */}
        {activeTab === 'facts' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              以下是从本院知识库提取并经过医疗合规脱敏的<strong>「标准高权重参数包」</strong>。运营在向垂直口腔网站（牙舒丽、开立特）供稿、或在知乎/头条改稿时，可一键复制嵌入：
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {QUICK_COPY_FACTS.map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col justify-between rounded-lg border border-border bg-background/60 p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
                      <h4 className="text-xs font-semibold text-foreground">{item.title}</h4>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.content, idx)}
                        className="rounded border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted transition"
                      >
                        {copiedIdx === idx ? '✓ 已复制' : '📋 一键复制'}\n                      </button>
                    </div>
                    <pre className="mt-2.5 whitespace-pre-wrap font-sans text-xs text-muted-foreground leading-relaxed">
                      {item.content}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
