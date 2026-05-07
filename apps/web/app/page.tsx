import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'GEO Studio · 让 AI 在客户问起时，引用你',
  description:
    '为口腔、医美、律所、教育、月子中心等本地高客单价服务品牌打造的多租户生成式引擎优化平台 — 内容调度、员工矩阵、追踪引擎、归因闭环全链路。',
};

// =====================================================================
// 这个着陆页用独立的暗色色板，不复用 globals.css 的 indigo→violet brand。
// 目的：1) 跟 admin 形成视觉对比；2) 不污染现有 14 个工作台子页色系。
// 所有色值通过 Tailwind arbitrary value 内联，不写入 globals.css。
// =====================================================================

const PALETTE = {
  bg: '#09090b', // zinc-950 — 全站底
  elev1: '#111114', // 略亮一档
  elev2: '#16181d', // 卡片底
  border: '#27272a', // zinc-800
  borderSoft: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  fg: '#fafafa', // zinc-50
  fgMuted: '#a1a1aa', // zinc-400
  fgDim: '#71717a', // zinc-500
  fgFaint: '#52525b', // zinc-600
  accent: '#34d399', // emerald-400 — GEO "被引用" 信号色（避开 AI 紫）
  accentSoft: 'rgba(52,211,153,0.12)',
  accentDim: 'rgba(52,211,153,0.30)',
  warn: '#f59e0b', // amber-500 — 合规 / 风险
  ink: '#0a0a0a',
};

// =====================================================================
// PAGE
// =====================================================================
export default function HomePage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: PALETTE.bg, color: PALETTE.fg }}
    >
      <Nav />
      <main>
        <Hero />
        <Industries />
        <FourPillars />
        <Compliance />
        <Discoverability />
        <Workflow />
        <CaseStudy />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

// =====================================================================
// NAV
// =====================================================================
function Nav() {
  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        background: 'rgba(9,9,11,0.72)',
        borderColor: PALETTE.borderSoft,
      }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[15px] font-semibold tracking-tight">
            GEO Studio
          </span>
          <span
            className="hidden rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wider sm:inline-block"
            style={{
              background: PALETTE.accentSoft,
              color: PALETTE.accent,
              border: `1px solid ${PALETTE.accentDim}`,
            }}
          >
            V1.7
          </span>
        </Link>

        <nav
          className="hidden items-center gap-7 text-[13px] md:flex"
          style={{ color: PALETTE.fgMuted }}
        >
          <a href="#pillars" className="transition hover:text-white">
            产品
          </a>
          <a href="#compliance" className="transition hover:text-white">
            合规
          </a>
          <a href="#workflow" className="transition hover:text-white">
            工作流
          </a>
          <a href="#case" className="transition hover:text-white">
            客户故事
          </a>
          <a href="#pricing" className="transition hover:text-white">
            定价
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-md px-3 py-1.5 text-[13px] font-medium transition sm:inline-block"
            style={{
              color: PALETTE.fgMuted,
              border: `1px solid ${PALETTE.borderStrong}`,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            登录
          </Link>
          <a
            href="#cta"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition"
            style={{ background: PALETTE.fg, color: PALETTE.ink }}
          >
            预约演示
            <Arrow />
          </a>
        </div>
      </div>
    </header>
  );
}

// =====================================================================
// HERO
// =====================================================================
function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* atmospheric glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
        style={{
          width: '1100px',
          height: '900px',
          marginTop: '-200px',
          background:
            'radial-gradient(closest-side, rgba(52,211,153,0.18) 0%, rgba(52,211,153,0.08) 30%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      {/* dotted grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 30%, black 50%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 30%, black 50%, transparent 100%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-28 md:pt-36">
        <a
          href="#discoverability"
          className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] transition"
          style={{
            border: `1px solid ${PALETTE.borderStrong}`,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
            color: PALETTE.fgMuted,
          }}
        >
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: PALETTE.accentSoft,
              color: PALETTE.accent,
            }}
          >
            NEW
          </span>
          <span>V1.7 上线 · 可发现层 Schema/JSON-LD/llms.txt 7 类支持 →</span>
        </a>

        <h1 className="mx-auto max-w-[18ch] text-center text-[clamp(2.4rem,6vw,5rem)] font-semibold leading-[1.04] tracking-[-0.038em]">
          让 AI 在客户问起时，
          <br />
          <span
            style={{
              backgroundImage: `linear-gradient(135deg, ${PALETTE.fg} 0%, ${PALETTE.accent} 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              fontStyle: 'italic',
              fontWeight: 500,
            }}
          >
            引用你。
          </span>
        </h1>

        <p
          className="mx-auto mt-6 max-w-[34ch] text-center text-[clamp(1rem,1.4vw,1.18rem)] leading-[1.6]"
          style={{ color: PALETTE.fgMuted }}
        >
          为口腔、医美、律所、教育、月子中心等本地高客单价服务品牌打造的
          多租户 GEO 全链路平台 — 内容调度、矩阵发布、追踪、归因，一条线。
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#cta"
            className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold transition"
            style={{ background: PALETTE.fg, color: PALETTE.ink }}
          >
            预约 30 分钟演示
            <Arrow />
          </a>
          <a
            href="#workflow"
            className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-medium transition"
            style={{
              color: PALETTE.fg,
              border: `1px solid ${PALETTE.borderStrong}`,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            ▶︎  看 4 步工作流
          </a>
        </div>

        <div
          className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]"
          style={{ color: PALETTE.fgDim }}
        >
          <span>已在 4 家口腔机构 · 40 人员工号矩阵 跑通</span>
          <Dot />
          <span>覆盖豆包 / 元宝 / 夸克 / DeepSeek 4 大引擎</span>
          <Dot />
          <span>医疗合规四道门</span>
        </div>

        <ProductMock />
      </div>
    </section>
  );
}

// =====================================================================
// PRODUCT MOCK (faux dashboard)
// =====================================================================
function ProductMock() {
  return (
    <div className="relative mx-auto mt-20 max-w-5xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          inset: '-20% -10%',
          background:
            'radial-gradient(60% 60% at 50% 0%, rgba(52,211,153,0.18), transparent 70%)',
          filter: 'blur(36px)',
          zIndex: -1,
        }}
      />
      <div
        className="rounded-2xl p-px"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.01))',
          boxShadow:
            '0 28px 60px -20px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div
          className="overflow-hidden rounded-2xl"
          style={{ background: PALETTE.elev1 }}
        >
          {/* titlebar */}
          <div
            className="flex items-center gap-1.5 border-b px-4 py-3"
            style={{
              borderColor: PALETTE.borderSoft,
              background: PALETTE.elev2,
            }}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span
              className="ml-3 flex-1 rounded px-3 py-1 text-center font-mono text-[11px]"
              style={{
                color: PALETTE.fgDim,
                background: PALETTE.elev1,
                border: `1px solid ${PALETTE.borderSoft}`,
                maxWidth: '380px',
                margin: '0 auto',
              }}
            >
              app.geo-studio.cn / t / songshu / citations
            </span>
          </div>

          {/* body */}
          <div className="grid min-h-[360px] grid-cols-[200px_1fr] max-md:grid-cols-1">
            <aside
              className="hidden border-r px-3 py-4 text-[12px] md:block"
              style={{
                borderColor: PALETTE.borderSoft,
                background: PALETTE.elev2,
              }}
            >
              <SideLabel>WORKSPACE</SideLabel>
              <SideItem dotColor={PALETTE.accent} active>
                Citations
              </SideItem>
              <SideItem>SoV 热力</SideItem>
              <SideItem>Content</SideItem>
              <SideItem>Compliance</SideItem>
              <SideItem>Discoverability</SideItem>

              <div className="mt-5">
                <SideLabel>ENGINES</SideLabel>
                <SideItem>豆包</SideItem>
                <SideItem>元宝</SideItem>
                <SideItem>夸克</SideItem>
                <SideItem>DeepSeek</SideItem>
              </div>
            </aside>

            <div className="px-6 py-5">
              <h4 className="text-[16px] font-semibold tracking-tight">
                松鼠口腔 · 引用追踪（最近 7 天）
              </h4>
              <p
                className="mb-4 mt-1 text-[12px]"
                style={{ color: PALETTE.fgDim }}
              >
                Playwright Worker 实时模拟真人查询 · 17 分钟前同步
              </p>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi label="引用次数" value="1,432" delta="+38%" />
                <Kpi label="覆盖问题" value="127" delta="+12" />
                <Kpi label="到店转化" value="48" delta="+9" />
                <Kpi label="合规通过率" value="98.4%" delta="+0.6pt" />
              </div>

              <div
                className="mt-4 rounded-lg border p-4"
                style={{
                  borderColor: PALETTE.borderSoft,
                  background: PALETTE.elev2,
                }}
              >
                <div className="mb-2 flex items-center justify-between text-[12px]">
                  <span style={{ color: PALETTE.fgMuted }}>
                    被引用问题趋势 · 4 大引擎
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                    style={{
                      background: PALETTE.accentSoft,
                      color: PALETTE.accent,
                    }}
                  >
                    AI 推荐扩词 →
                  </span>
                </div>
                <ChartSvg />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartSvg() {
  return (
    <svg
      viewBox="0 0 500 110"
      preserveAspectRatio="none"
      className="block h-[120px] w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="grad-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="28" x2="500" y2="28" stroke="rgba(255,255,255,0.04)" />
      <line x1="0" y1="56" x2="500" y2="56" stroke="rgba(255,255,255,0.04)" />
      <line x1="0" y1="84" x2="500" y2="84" stroke="rgba(255,255,255,0.04)" />
      <path
        d="M 0 84 L 35 75 L 70 78 L 105 62 L 140 65 L 175 48 L 210 54 L 245 38 L 280 44 L 315 28 L 350 32 L 385 22 L 420 26 L 455 14 L 500 18 L 500 110 L 0 110 Z"
        fill="url(#grad-area)"
      />
      <path
        d="M 0 84 L 35 75 L 70 78 L 105 62 L 140 65 L 175 48 L 210 54 L 245 38 L 280 44 L 315 28 L 350 32 L 385 22 L 420 26 L 455 14 L 500 18"
        fill="none"
        stroke="#34d399"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="500" cy="18" r="4" fill="#34d399" />
      <circle cx="500" cy="18" r="9" fill="#34d399" opacity="0.2" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-3"
      style={{
        borderColor: PALETTE.borderSoft,
        background: PALETTE.elev2,
      }}
    >
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: PALETTE.fgDim }}
      >
        {label}
      </div>
      <div className="text-[20px] font-semibold tabular-nums tracking-tight">
        {value}
      </div>
      <div
        className="mt-0.5 font-mono text-[11px]"
        style={{ color: PALETTE.accent }}
      >
        ↑ {delta}
      </div>
    </div>
  );
}

function SideLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ color: PALETTE.fgFaint }}
    >
      {children}
    </div>
  );
}
function SideItem({
  children,
  active,
  dotColor,
}: {
  children: React.ReactNode;
  active?: boolean;
  dotColor?: string;
}) {
  return (
    <div
      className="mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px]"
      style={{
        background: active ? PALETTE.accentSoft : 'transparent',
        color: active ? PALETTE.fg : PALETTE.fgMuted,
        fontWeight: active ? 500 : 400,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: dotColor || (active ? PALETTE.accent : PALETTE.fgFaint),
          boxShadow: active ? `0 0 0 3px ${PALETTE.accentSoft}` : 'none',
        }}
      />
      {children}
    </div>
  );
}

// =====================================================================
// INDUSTRIES — 5 个垂直行业
// =====================================================================
const INDUSTRIES = [
  { name: '口腔', tagline: '种植 / 正畸 / 儿牙', case: '首客 · 跑通' },
  { name: '医美', tagline: '抗衰 / 轮廓 / 皮肤管理', case: '已对接 KB' },
  { name: '律所', tagline: '婚家 / 商事 / 刑辩', case: '配置中' },
  { name: '教育', tagline: 'K12 / 出国 / 职考', case: '配置中' },
  { name: '月子中心', tagline: '产康 / 私护 / 营养', case: '试点中' },
];

function Industries() {
  return (
    <Section eyebrow="VERTICALS · 5 个赛道" id="industries">
      <SectionHead
        title={<>本地高客单价服务，<br className="hidden md:block" />不止于做出来给搜索引擎看。</>}
        sub="每个行业的合规红线、问题图谱、内容套路完全不同。GEO Studio 把这套方法论配置化（D2 决策），同一套核心配 5 套行业知识库。"
      />
      <div className="mt-12 grid gap-3 md:grid-cols-5">
        {INDUSTRIES.map((it, idx) => (
          <article
            key={it.name}
            className="rounded-xl p-5 transition hover:translate-y-[-2px]"
            style={{
              border: `1px solid ${PALETTE.borderSoft}`,
              background:
                idx === 0
                  ? `linear-gradient(180deg, ${PALETTE.accentSoft}, ${PALETTE.elev2})`
                  : PALETTE.elev1,
            }}
          >
            <div
              className="font-mono text-[10px] uppercase tracking-wider"
              style={{
                color: idx === 0 ? PALETTE.accent : PALETTE.fgDim,
              }}
            >
              {String(idx + 1).padStart(2, '0')}
            </div>
            <h3 className="mt-2 text-[18px] font-semibold tracking-tight">
              {it.name}
            </h3>
            <p
              className="mt-1 text-[13px]"
              style={{ color: PALETTE.fgMuted }}
            >
              {it.tagline}
            </p>
            <div
              className="mt-4 inline-flex items-center gap-1.5 rounded font-mono text-[10px]"
              style={{ color: PALETTE.fgDim }}
            >
              <span
                className="h-1 w-1 rounded-full"
                style={{
                  background: idx === 0 ? PALETTE.accent : PALETTE.fgFaint,
                }}
              />
              {it.case}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

// =====================================================================
// FOUR PILLARS — 4 大模块（核心差异化）
// =====================================================================
function FourPillars() {
  return (
    <Section eyebrow="THE FOUR PILLARS" id="pillars">
      <SectionHead
        title={
          <>
            竞品做 1 或 3。<br className="hidden md:block" />
            <span style={{ color: PALETTE.accent }}>没人做 2 和 4。</span>
          </>
        }
        sub="市面上的 GEO 工具大多停在「监测出报表」。我们做完整闭环 — 内容、矩阵、追踪、归因，缺一不可。2 和 4 是真正的壁垒。"
      />

      <div className="mt-12 grid gap-3 md:grid-cols-2">
        <Pillar
          n="01"
          title="内容调度中台"
          competitor
          tag="竞品也在做"
          desc="图文 + 抖音脚本双轨，基于 GEO 学术 9 法内置写作指南。V1.8 起 12 套写作要求 × 平台风格双层叠加（D20）— 同一选题，自动派生小红书种草版 / 知乎硬核版 / 公众号情感版。"
          stat="12 套写作要求 · 6 大平台风格"
        />
        <Pillar
          n="02"
          title="员工矩阵发布助手"
          tag="只有我们"
          desc="40 人实名号矩阵的派单 + 执行打卡。绝不自动化提交（D3）— 因为员工实名号自动化 = 集体封号 + 法律风险。手动派单也能解决 2 个核心问题：执行率追踪 + 风格分散。"
          stat="40 人矩阵 · 派单到执行打卡完整链路"
        />
        <Pillar
          n="03"
          title="GEO 追踪引擎"
          competitor
          tag="竞品也在做"
          desc="不走火山方舟 API（D4）— API 返回的是纯 LLM，没 RAG 检索层，跟真用户看到的答案不一样。我们用 Playwright 模拟真人在豆包 / 元宝 App 和 Web 端追踪引用，覆盖 4 大引擎。"
          stat="豆包 + 元宝 + 夸克 + DeepSeek · 真实场景"
        />
        <Pillar
          n="04"
          title="多钩子转化归因"
          tag="只有我们"
          desc="不依赖前台强制问话（D6 — 执行率低会漏 50%+ 数据）。多钩子自动回流：医生名 / 活动暗号 / 电话尾号 / 企微 utm，从 AI 引用一路追踪到到店、成交、客单价。"
          stat="4 类钩子 · 闭环到客单价"
        />
      </div>
    </Section>
  );
}

function Pillar({
  n,
  title,
  desc,
  tag,
  competitor,
  stat,
}: {
  n: string;
  title: string;
  desc: string;
  tag: string;
  competitor?: boolean;
  stat: string;
}) {
  return (
    <article
      className="flex flex-col rounded-xl p-7 transition hover:translate-y-[-2px]"
      style={{
        border: `1px solid ${competitor ? PALETTE.borderSoft : PALETTE.accentDim}`,
        background: competitor
          ? PALETTE.elev1
          : `linear-gradient(180deg, ${PALETTE.accentSoft} 0%, ${PALETTE.elev1} 60%)`,
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span
          className="font-mono text-[11px] tracking-wider"
          style={{ color: competitor ? PALETTE.fgDim : PALETTE.accent }}
        >
          PILLAR {n}
        </span>
        <span
          className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
          style={{
            color: competitor ? PALETTE.fgDim : PALETTE.accent,
            borderColor: competitor
              ? PALETTE.borderSoft
              : PALETTE.accentDim,
          }}
        >
          {tag}
        </span>
      </div>
      <h3 className="text-[22px] font-semibold tracking-tight">{title}</h3>
      <p
        className="mt-3 text-[14.5px] leading-[1.65] flex-1"
        style={{ color: PALETTE.fgMuted }}
      >
        {desc}
      </p>
      <div
        className="mt-5 border-t pt-4 font-mono text-[11.5px]"
        style={{
          borderColor: PALETTE.borderSoft,
          color: PALETTE.fgDim,
        }}
      >
        → {stat}
      </div>
    </article>
  );
}

// =====================================================================
// COMPLIANCE — 医疗合规四道门
// =====================================================================
const GATES = [
  {
    n: '01',
    name: '关键词黑名单',
    speed: '< 50ms',
    way: '同步 · 按平台作用域',
    why: '抖音和小红书的红线词不一样（D12），全局判罚会漏或过严。',
  },
  {
    n: '02',
    name: 'LLM 语义审查',
    speed: '< 3s',
    way: '异步 · 豆包 Pro',
    why: '关键词漏不掉「软违规」—「效果好」「首家」这种没明令禁止但翻车即十万起罚的表达。',
  },
  {
    n: '03',
    name: '历史案例匹配',
    speed: 'pgvector',
    way: '锚定真实罚单',
    why: '（D12 升级）让违规判断有过往真实罚单做锚，而不是只靠抽象关键词或 LLM 主观。',
  },
  {
    n: '04',
    name: '高/中风险人工复核',
    speed: '< 1h',
    way: '管理员审批',
    why: '低风险走 1+2，中高风险必须有人。审计日志保留 ≥ 3 年（医疗广告法诉讼时效）。',
  },
];

function Compliance() {
  return (
    <Section eyebrow="COMPLIANCE · 四道门" id="compliance">
      <SectionHead
        title={
          <>
            医疗内容翻车一次，
            <br className="hidden md:block" />
            <span style={{ color: PALETTE.warn }}>十万起步。</span>
          </>
        }
        sub="所有用户可见内容发布前必走四道门（D5 + D12）。一道门挡不住的，下一道门接住。"
      />
      <div className="mt-12 grid gap-3 md:grid-cols-4">
        {GATES.map((g) => (
          <article
            key={g.n}
            className="rounded-xl p-6 transition"
            style={{
              border: `1px solid ${PALETTE.borderSoft}`,
              background: PALETTE.elev1,
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span
                className="font-mono text-[11px]"
                style={{ color: PALETTE.warn }}
              >
                GATE {g.n}
              </span>
              <span
                className="font-mono text-[10px]"
                style={{ color: PALETTE.fgDim }}
              >
                {g.speed}
              </span>
            </div>
            <h3 className="text-[16px] font-semibold tracking-tight">
              {g.name}
            </h3>
            <div
              className="mt-1 font-mono text-[10.5px]"
              style={{ color: PALETTE.fgFaint }}
            >
              {g.way}
            </div>
            <p
              className="mt-4 text-[13px] leading-[1.6]"
              style={{ color: PALETTE.fgMuted }}
            >
              {g.why}
            </p>
          </article>
        ))}
      </div>

      <div
        className="mx-auto mt-6 max-w-3xl rounded-xl px-6 py-5 text-center"
        style={{
          border: `1px solid ${PALETTE.borderSoft}`,
          background:
            'linear-gradient(180deg, rgba(245,158,11,0.06), transparent)',
        }}
      >
        <span
          className="font-mono text-[11px]"
          style={{ color: PALETTE.warn }}
        >
          AUDIT LOG · ≥ 3 YEARS
        </span>
        <p className="mt-2 text-[14px]" style={{ color: PALETTE.fgMuted }}>
          所有审查记录保留 3 年以上 — 医疗广告法诉讼时效，监管来查时拿得出。
        </p>
      </div>
    </Section>
  );
}

// =====================================================================
// DISCOVERABILITY — Layer A 可发现层
// =====================================================================
const DISCOVERY = [
  { name: 'Schema.org JSON-LD', count: '7 类' },
  { name: '/c/[slug]/llms.txt', count: '+ llms-full.txt' },
  { name: 'AI Content Feed', count: 'JSON' },
  { name: 'AI Sitemap', count: 'XML' },
  { name: 'Discoverability Audit', count: '4 维度评分' },
  { name: 'Build-on-write 缓存', count: '<50ms 单行 SELECT' },
];

function Discoverability() {
  return (
    <Section eyebrow="LAYER A · 可发现层（V1.7 已交付）" id="discoverability">
      <SectionHead
        title={
          <>
            GEO 三层模型（可发现 / 生产 / 验证），
            <br className="hidden md:block" />
            上游空白，下游再多努力都是漏斗。
          </>
        }
        sub="V1.7 把 Layer A 一次填齐 — Schema.org JSON-LD 7 类 + llms.txt + AI Content Feed + AI Sitemap，AI 引擎先「看见」你才能引用你。"
      />

      <div className="mt-12 grid gap-3 md:grid-cols-3">
        {DISCOVERY.map((d, idx) => (
          <div
            key={d.name}
            className="rounded-xl p-5 transition"
            style={{
              border: `1px solid ${PALETTE.borderSoft}`,
              background: PALETTE.elev1,
            }}
          >
            <div
              className="mb-2 font-mono text-[10px] uppercase tracking-wider"
              style={{ color: PALETTE.accent }}
            >
              ✓  SHIPPED
            </div>
            <div className="font-mono text-[14px] font-medium">
              {d.name}
            </div>
            <div
              className="mt-1 text-[12.5px]"
              style={{ color: PALETTE.fgMuted }}
            >
              {d.count}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-8 rounded-xl p-7"
        style={{
          border: `1px solid ${PALETTE.borderSoft}`,
          background: PALETTE.elev1,
        }}
      >
        <div
          className="mb-3 font-mono text-[11px] uppercase tracking-wider"
          style={{ color: PALETTE.fgDim }}
        >
          / c / songshu / llms.txt — 一段示例
        </div>
        <pre
          className="overflow-x-auto rounded-md p-4 font-mono text-[12px] leading-[1.6]"
          style={{
            background: PALETTE.bg,
            border: `1px solid ${PALETTE.borderSoft}`,
            color: PALETTE.fgMuted,
          }}
        >
{`# 松鼠口腔 (Songshu Dental)
> 30 年专注本地家庭口腔健康。儿牙、正畸、种植专科。

## Services
- 儿童牙科 - /c/songshu/services/pediatric
- 正畸（隐适美 / 时代天使）- /c/songshu/services/ortho
- 种植牙 - /c/songshu/services/implant

## FAQs (compliance: approved)
- 儿童几岁可以做窝沟封闭？ → /c/songshu/faqs/sealant-age
- 正畸需要拔牙吗？ → /c/songshu/faqs/ortho-extraction

## Last verified: 2026-05-04`}
        </pre>
        <p
          className="mt-3 text-[12.5px]"
          style={{ color: PALETTE.fgDim }}
        >
          只填有值字段，不用 placeholder 凑数（D18）— placeholder schema
          比缺字段更糟，gaming 招致 AI 引擎降权。
        </p>
      </div>
    </Section>
  );
}

// =====================================================================
// WORKFLOW — 4 步上线
// =====================================================================
const STEPS = [
  {
    n: '01',
    title: '接入 KB',
    sub: '5 分钟',
    body: '上传品牌资产、过往内容、医生名单、服务清单。系统自动构建客户旅程图谱。',
  },
  {
    n: '02',
    title: '配置词库 + 写作要求',
    sub: '30 分钟',
    body: '6 维组合 + AI 智能挖掘关键词。挑选 12 套预设写作要求（PAS / 知乎硬核 / 终极指南…）或新建。',
  },
  {
    n: '03',
    title: 'AI 出稿 + 四道门审',
    sub: '< 5 分钟 / 篇',
    body: '写作要求 × 平台风格双层叠加自动生稿（D20）。四道门合规审 → 合格内容进入派单池。',
  },
  {
    n: '04',
    title: '矩阵发布 → 追踪 → 归因',
    sub: '7 天看首篇引用',
    body: '40 人员工矩阵手动派单（D3 不自动化）。Playwright 追踪引用 → 多钩子归因到到店转化。',
  },
];

function Workflow() {
  return (
    <Section eyebrow="WORKFLOW · 4 STEPS" id="workflow">
      <SectionHead
        title="4 步上线，下周一就能看到首篇被引用。"
        sub="不需要重做营销栈。GEO Studio 接你已有的 KB 和员工号矩阵，从历史数据里学起。"
      />
      <div className="mt-12 grid gap-3 md:grid-cols-4">
        {STEPS.map((s) => (
          <article
            key={s.n}
            className="rounded-xl p-6"
            style={{
              border: `1px solid ${PALETTE.borderSoft}`,
              background: PALETTE.elev1,
            }}
          >
            <div className="mb-4 flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: PALETTE.accent,
                  boxShadow: `0 0 0 3px ${PALETTE.accentSoft}`,
                }}
              />
              <span
                className="font-mono text-[11px] tracking-wider"
                style={{ color: PALETTE.accent }}
              >
                STEP {s.n}
              </span>
              <span
                className="ml-auto font-mono text-[10px]"
                style={{ color: PALETTE.fgDim }}
              >
                {s.sub}
              </span>
            </div>
            <h3 className="text-[18px] font-semibold tracking-tight">
              {s.title}
            </h3>
            <p
              className="mt-2 text-[13px] leading-[1.6]"
              style={{ color: PALETTE.fgMuted }}
            >
              {s.body}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

// =====================================================================
// CASE — 占位首客口腔医院
// =====================================================================
function CaseStudy() {
  return (
    <Section eyebrow="CUSTOMER STORY · 01" id="case">
      <div
        className="mx-auto max-w-5xl rounded-2xl p-10 md:p-14"
        style={{
          background: PALETTE.elev1,
          border: `1px solid ${PALETTE.borderSoft}`,
        }}
      >
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
          <div>
            <div
              className="font-mono text-[11px] uppercase tracking-wider"
              style={{ color: PALETTE.fgDim }}
            >
              首客 · 4 月跑通
            </div>
            <h3 className="mt-3 text-[22px] font-semibold tracking-tight">
              松鼠口腔
            </h3>
            <p
              className="mt-2 text-[13.5px] leading-[1.6]"
              style={{ color: PALETTE.fgMuted }}
            >
              30 年家庭口腔诊所 · 40 人员工号矩阵 · 儿牙 / 正畸 / 种植专科。
            </p>
            <div
              className="mt-6 rounded-lg p-5"
              style={{
                background: PALETTE.elev2,
                border: `1px solid ${PALETTE.borderSoft}`,
              }}
            >
              <p
                className="text-[14px] italic leading-[1.6]"
                style={{ color: PALETTE.fg }}
              >
                "之前在小红书做了 3 年，靠的是发得多。装上 GEO Studio 之后我们
                发得反而少了，但豆包开始稳定推荐我们 — 新患问诊电话翻倍。"
              </p>
              <div
                className="mt-4 flex items-center gap-3 border-t pt-4"
                style={{ borderColor: PALETTE.borderSoft }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold"
                  style={{
                    background: `linear-gradient(135deg, ${PALETTE.accent}, #16a34a)`,
                    color: PALETTE.ink,
                  }}
                >
                  贾
                </div>
                <div>
                  <div className="text-[13px] font-medium">贾真真医生</div>
                  <div
                    className="text-[11.5px]"
                    style={{ color: PALETTE.fgDim }}
                  >
                    松鼠口腔 · 内容主理人
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric value="+840%" label="小红书声量" />
            <Metric value="12,430" label="AI 引用次数" />
            <Metric value="+38%" label="新患转化" />
            <Metric value="98.4%" label="合规通过率" />
            <div
              className="col-span-2 rounded-lg p-5"
              style={{
                background: PALETTE.elev2,
                border: `1px solid ${PALETTE.borderSoft}`,
              }}
            >
              <div
                className="mb-2 font-mono text-[10.5px] uppercase tracking-wider"
                style={{ color: PALETTE.fgDim }}
              >
                被引用样本
              </div>
              <div className="space-y-1.5 text-[12.5px]">
                <CitationLine
                  q="儿童几岁可以做窝沟封闭？"
                  engine="豆包"
                />
                <CitationLine
                  q="深圳福田区好的儿童牙医推荐"
                  engine="元宝"
                />
                <CitationLine q="隐适美和时代天使有什么区别" engine="夸克" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        background: PALETTE.elev2,
        border: `1px solid ${PALETTE.borderSoft}`,
      }}
    >
      <div
        className="text-[28px] font-semibold tabular-nums tracking-tight"
        style={{ color: PALETTE.accent }}
      >
        {value}
      </div>
      <div
        className="mt-1 font-mono text-[10.5px] uppercase tracking-wider"
        style={{ color: PALETTE.fgDim }}
      >
        {label}
      </div>
    </div>
  );
}

function CitationLine({ q, engine }: { q: string; engine: string }) {
  return (
    <div className="flex items-center gap-2 font-mono">
      <span
        className="rounded px-1.5 py-px text-[10px]"
        style={{
          background: PALETTE.accentSoft,
          color: PALETTE.accent,
        }}
      >
        {engine}
      </span>
      <span style={{ color: PALETTE.fgMuted }}>{q}</span>
    </div>
  );
}

// =====================================================================
// PRICING — 占位 3 档
// =====================================================================
function Pricing() {
  return (
    <Section eyebrow="PRICING" id="pricing">
      <SectionHead
        title="按效果定价 — 引用了，再付款。"
        sub="所有方案包含完整 11 步工作流、19 个发布平台、医疗合规四道门。年付立省 20%。"
      />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <PriceCard
          tier="STARTER"
          price="¥2,980"
          unit="/ 月"
          desc="单门店 · 适合刚入场试水。"
          features={[
            '1 个租户 · 1 个品牌',
            '5 人员工矩阵',
            '2 大引擎追踪（豆包 + 元宝）',
            '基础合规四道门',
          ]}
          cta="预约演示"
        />
        <PriceCard
          tier="GROWTH"
          price="¥6,980"
          unit="/ 月"
          desc="多店连锁 · 90% 客户选这个。"
          features={[
            '3 个租户 · 多品牌',
            '40 人员工矩阵',
            '4 大引擎全覆盖',
            '完整四道门 + 历史案例库',
            'V1.7 Layer A 可发现层',
            '专属客户成功',
          ]}
          cta="预约演示"
          featured
        />
        <PriceCard
          tier="ENTERPRISE"
          price="面议"
          unit=""
          desc="区域连锁 / 多品类集团。"
          features={[
            '不限租户',
            '不限员工矩阵',
            '私有部署 · 等保三级',
            'SAML SSO + 审计日志',
            '专属解决方案架构师',
          ]}
          cta="联系销售"
        />
      </div>
    </Section>
  );
}

function PriceCard({
  tier,
  price,
  unit,
  desc,
  features,
  cta,
  featured,
}: {
  tier: string;
  price: string;
  unit: string;
  desc: string;
  features: string[];
  cta: string;
  featured?: boolean;
}) {
  return (
    <article
      className="relative flex flex-col rounded-xl p-7 transition hover:translate-y-[-2px]"
      style={{
        border: `1px solid ${featured ? PALETTE.accentDim : PALETTE.borderSoft}`,
        background: featured
          ? `linear-gradient(180deg, ${PALETTE.accentSoft} 0%, ${PALETTE.elev1} 60%)`
          : PALETTE.elev1,
        boxShadow: featured
          ? `0 0 0 1px ${PALETTE.accentDim}, 0 8px 32px -8px rgba(52,211,153,0.3)`
          : 'none',
      }}
    >
      {featured && (
        <span
          className="absolute -top-3 right-6 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: PALETTE.accent, color: PALETTE.ink }}
        >
          最受欢迎
        </span>
      )}
      <div
        className="mb-3 font-mono text-[11px] tracking-[0.14em]"
        style={{ color: PALETTE.fgDim }}
      >
        {tier}
      </div>
      <div className="mb-4 flex items-baseline gap-1.5">
        <span className="text-[40px] font-semibold tabular-nums tracking-[-0.03em]">
          {price}
        </span>
        {unit && (
          <span
            className="text-[14px]"
            style={{ color: PALETTE.fgDim }}
          >
            {unit}
          </span>
        )}
      </div>
      <p
        className="mb-5 text-[13px]"
        style={{ color: PALETTE.fgMuted }}
      >
        {desc}
      </p>
      <hr style={{ borderColor: PALETTE.borderSoft }} />
      <ul className="my-5 flex flex-1 flex-col gap-3 text-[13px]">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2.5"
            style={{ color: PALETTE.fgMuted }}
          >
            <Check />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <a
        href="#cta"
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-[13px] font-semibold transition"
        style={{
          background: featured ? PALETTE.accent : 'transparent',
          color: featured ? PALETTE.ink : PALETTE.fg,
          border: featured ? 'none' : `1px solid ${PALETTE.borderStrong}`,
        }}
      >
        {cta}
        <Arrow />
      </a>
    </article>
  );
}

// =====================================================================
// FINAL CTA
// =====================================================================
function FinalCta() {
  return (
    <Section id="cta">
      <div
        className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl px-8 py-16 text-center md:px-16"
        style={{
          border: `1px solid ${PALETTE.accentDim}`,
          background: `radial-gradient(at 50% 0%, ${PALETTE.accentSoft} 0%, transparent 50%), linear-gradient(180deg, rgba(52,211,153,0.06), rgba(52,211,153,0.01))`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 80%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, transparent 80%)',
          }}
        />
        <div className="relative">
          <h2 className="mx-auto max-w-[20ch] text-[clamp(1.7rem,3.5vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.028em]">
            把今晚加班写稿这件事，
            <br />
            交给 GEO Studio。
          </h2>
          <p
            className="mx-auto mt-4 max-w-[40ch] text-[15px]"
            style={{ color: PALETTE.fgMuted }}
          >
            预约一次 30 分钟演示，我们会用你公司的真实问题，
            现场跑一遍 AI 引擎到底有没有引用你。
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:hello@geo-studio.cn"
              className="inline-flex items-center gap-1.5 rounded-md px-6 py-3 text-[14px] font-semibold transition"
              style={{ background: PALETTE.accent, color: PALETTE.ink }}
            >
              预约 30 分钟演示
              <Arrow />
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-md px-6 py-3 text-[14px] font-medium transition"
              style={{
                color: PALETTE.fg,
                border: `1px solid ${PALETTE.borderStrong}`,
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              已经是客户？登录
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}

// =====================================================================
// FOOTER
// =====================================================================
function Footer() {
  return (
    <footer
      className="border-t"
      style={{ borderColor: PALETTE.borderSoft }}
    >
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-[15px] font-semibold tracking-tight">
                GEO Studio
              </span>
            </Link>
            <p
              className="mt-4 max-w-[28ch] text-[13px] leading-[1.55]"
              style={{ color: PALETTE.fgDim }}
            >
              为本地高客单价服务品牌打造的多租户 GEO
              全链路平台。让 AI 在客户问起时，引用你。
            </p>
          </div>
          <FooterCol
            title="产品"
            links={[
              ['内容中台', '#pillars'],
              ['追踪引擎', '#pillars'],
              ['归因闭环', '#pillars'],
              ['定价', '#pricing'],
            ]}
          />
          <FooterCol
            title="行业"
            links={[
              ['口腔', '#industries'],
              ['医美', '#industries'],
              ['律所', '#industries'],
              ['教育 / 月子', '#industries'],
            ]}
          />
          <FooterCol
            title="资源"
            links={[
              ['可发现层指南', '#discoverability'],
              ['合规四道门', '#compliance'],
              ['客户故事', '#case'],
              ['文档', '/docs'],
            ]}
          />
          <FooterCol
            title="公司"
            links={[
              ['关于', '/about'],
              ['联系', 'mailto:hello@geo-studio.cn'],
              ['合作伙伴', '/partners'],
              ['隐私政策', '/privacy'],
            ]}
          />
        </div>
        <div
          className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-[12px]"
          style={{
            borderColor: PALETTE.borderSoft,
            color: PALETTE.fgDim,
          }}
        >
          <div>
            © 2026 GEO Studio · 全部系统正常运行{' '}
            <span style={{ color: PALETTE.accent }}>●</span>
          </div>
          <div className="flex gap-5">
            <a href="/terms" className="hover:text-white">
              使用条款
            </a>
            <a href="/privacy" className="hover:text-white">
              隐私政策
            </a>
            <a href="/security" className="hover:text-white">
              安全
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <h4
        className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.14em]"
        style={{ color: PALETTE.fgDim }}
      >
        {title}
      </h4>
      <ul className="flex flex-col gap-2.5">
        {links.map(([t, href]) => (
          <li key={t}>
            <a
              href={href}
              className="text-[13px] transition hover:text-white"
              style={{ color: PALETTE.fgMuted }}
            >
              {t}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =====================================================================
// SHARED PRIMITIVES
// =====================================================================
function Section({
  children,
  eyebrow,
  id,
}: {
  children: React.ReactNode;
  eyebrow?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="relative px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl">
        {eyebrow && (
          <div className="mb-3 text-center">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em]"
              style={{
                color: PALETTE.accent,
                borderColor: PALETTE.borderStrong,
                background: PALETTE.accentSoft,
              }}
            >
              {eyebrow}
            </span>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function SectionHead({
  title,
  sub,
}: {
  title: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="mx-auto mt-2 max-w-3xl text-center">
      <h2 className="text-[clamp(1.6rem,3.6vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.028em]">
        {title}
      </h2>
      {sub && (
        <p
          className="mx-auto mt-4 max-w-[44ch] text-[15px] leading-[1.65]"
          style={{ color: PALETTE.fgMuted }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke={PALETTE.accent}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-[3px] flex-shrink-0"
      aria-hidden
    >
      <polyline points="3 8 7 12 13 4" />
    </svg>
  );
}

function Dot() {
  return (
    <span
      className="h-1 w-1 rounded-full"
      style={{ background: PALETTE.fgFaint }}
      aria-hidden
    />
  );
}

function LogoMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden
      className="flex-shrink-0"
    >
      <defs>
        <linearGradient id="lm-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={PALETTE.accent} />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect width="22" height="22" rx="6" fill="url(#lm-grad)" />
      <rect x="4" y="4" width="14" height="14" rx="3" fill={PALETTE.bg} />
      <rect x="8" y="8" width="6" height="6" rx="1" fill={PALETTE.accent} />
    </svg>
  );
}
