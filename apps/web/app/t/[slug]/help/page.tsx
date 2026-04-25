import Link from 'next/link';
import { requireTenantMember } from '@/lib/tenant';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function HelpPage({ params }: { params: { slug: string } }) {
  const tenant = await requireTenantMember(params.slug);

  return (
    <div className="space-y-6">
      <PageHeader
        title="使用手册"
        subtitle="GEO Studio 怎么用 · 每个模块在做什么 · 常见疑惑解答"
      />

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        {/* TOC */}
        <aside className="sticky top-6 hidden h-fit space-y-1 text-sm lg:block">
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            目录
          </p>
          {TOC.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </aside>

        {/* Long-form content */}
        <article className="prose prose-slate max-w-none space-y-10">
          <Section id="overview" title="GEO Studio 在解决什么问题">
            <p>
              <strong>GEO(Generative Engine Optimization)</strong> 是 SEO 之后的下一个流量入口。
              当用户问"南京种植牙推荐哪家"时,他们越来越多在豆包、元宝、ChatGPT 里直接问,而不是去百度。
              答案里出现的医院名字,就是这个时代的"自然搜索结果"。
            </p>
            <p>GEO Studio 把 5 件事串成一条流水线,让品牌在 AI 答案里被系统性地提到:</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li><strong>内容生产</strong>:把医生写的一篇科普,自动改写成 6 个平台版本</li>
              <li><strong>合规审查</strong>:三道门防医疗广告法翻车</li>
              <li><strong>员工矩阵发布</strong>:派给 40 人,真人发布,反爬绝缘</li>
              <li><strong>GEO 追踪</strong>:模拟真人在豆包问问题,看品牌是否被提到</li>
              <li><strong>转化归因</strong>:暗号让患者自带"看了哪条来的"路径</li>
            </ol>
            <p className="text-sm text-muted-foreground">
              市面上的 GEO 工具大多只做 1 或 4。GEO Studio 做完整闭环 — 这是和竞品的核心差异。
            </p>
          </Section>

          <Section id="content" title="模块一 · 内容生产">
            <h3 className="text-base font-medium">为什么从「上传素材」开始</h3>
            <p>
              GEO 改写的质量上限取决于源素材。AI 改 AI 写的内容,会一代不如一代(信息熵衰减)。
              建议上传:科普文章、临床指南、医生专业访谈、典型病例(脱敏)。
            </p>
            <h3 className="text-base font-medium">流程</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>「内容」→「上传文件」选 Word / PDF / Markdown / 纯文本</li>
              <li>系统异步解析 10-30 秒,状态变为「已解析」</li>
              <li>点条目 → 详情页 → 选目标平台(头条号 / 抖音 / 知乎 / 小红书 ...)→ 「生成 N 个变体」</li>
              <li>豆包按 GEO 9 法改写(权威引用、统计数据、流畅度优化等),约 60-130s 出结果</li>
              <li>每条变体自动进入合规审核</li>
            </ol>
            <h3 className="text-base font-medium">技术决策</h3>
            <p className="text-sm text-muted-foreground">
              生成走 worker 进程而非 web server action — 单次 LLM 调用 ~60s,Vercel server action 上限 10s,会卡。
              并行 6 平台时 worker 用 Promise.allSettled,大约 2 分钟完成。
            </p>
          </Section>

          <Section id="compliance" title="模块二 · 合规审核(三道门)">
            <p>
              医疗广告法对绝对化用语 / 治愈承诺 / 患者照片 / 专家排名等有明确禁用,违规处罚十万起步。
              我们用三道门覆盖不同风险:
            </p>
            <div className="space-y-2 rounded-md bg-muted/50 p-4 text-sm">
              <p><strong>第一道</strong>:关键词扫描(同步,&lt; 50ms)。A 级直接拒(根治、永不复发、第一、最好...),B 级警告(领先、首选、值得信赖...)。</p>
              <p><strong>第二道</strong>:豆包 LLM 语义审查(异步,&lt; 3s)。读上下文判断,关键词命中也可能因为是反例引用而通过。</p>
              <p><strong>第三道</strong>:管理员人工复核。B 级 + LLM 不确定的进这里。SLA 中位数 &lt; 2 小时。</p>
            </div>
            <p className="text-sm">
              所有审核行为写 audit_logs,保留 ≥ 3 年(医疗广告法诉讼时效)。
            </p>
          </Section>

          <Section id="publish" title="模块三 · 派单 + 员工矩阵">
            <h3 className="text-base font-medium">为什么不自动发布</h3>
            <p>
              头条 / 抖音对自动化检测严格,自动发 = 集体封号 + 法律风险。
              我们坚持<strong>员工真人发布</strong>:派单算法只决定"谁发什么",发布动作员工手工完成。
            </p>
            <h3 className="text-base font-medium">派单算法考虑什么</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li><strong>平台匹配</strong>:员工只发自己有账号的平台</li>
              <li><strong>人设匹配</strong>:种植牙变体派给种植专家,儿牙变体派给儿牙医生</li>
              <li><strong>节奏</strong>:每人每天 ≤ 2 条,避免突击</li>
              <li><strong>新颖度</strong>:同员工不连发相似内容,避免被平台判为机器</li>
            </ul>
            <h3 className="text-base font-medium">员工怎么登录(V1)</h3>
            <p className="text-sm">
              员工没邮箱,V1 用「管理员手发 6 位访问码」过渡。员工去 <code>/staff/login</code> 输手机号 + 6 位 →
              看到任务卡片。任务卡里显示<strong>暗号</strong>(activity_code),员工"复制文案"会自动加 CTA 含暗号。
              V1 收尾切阿里云 SMS OTP。
            </p>
          </Section>

          <Section id="tracking" title="模块四 · GEO 追踪">
            <h3 className="text-base font-medium">为什么不直接调豆包 API</h3>
            <p>
              豆包 API 返回的是纯 LLM 答案,不带 RAG 检索层 —— 和真实用户在豆包 App / Web 看到的答案<strong>完全不同</strong>。
              真用户看到的有知识卡片、搜索引文、公关词条等;API 看到的是干净的语言模型生成。
              所以追踪必须模拟真人,我们用 Playwright + 系统 Chrome + 反指纹检测打开豆包 Web。
            </p>
            <h3 className="text-base font-medium">解析策略</h3>
            <p>
              豆包游客模式答复**通常没有显式引用 URL**,品牌名出现在纯文本里。所以主信号是
              <strong>品牌词典 NER</strong>(基于 brand_vocab):本品牌、竞品、医生名、城市、服务名都打进字典,
              对答复全文做关键词命中。citation URL 作为 bonus 信号。
            </p>
            <p className="text-sm">见 <code>docs/adr/002-geo-tracking-parse-strategy.md</code> 的完整推理。</p>
            <h3 className="text-base font-medium">V1 限制</h3>
            <p className="text-sm text-muted-foreground">
              同 IP 短时高频请求会被豆包静默限流(不弹验证码、不报错,就是不渲染答复)。
              V1 半自动每周跑一次足矣;V2 加代理池 + 账号池支持 7×24 自动追踪。
            </p>
          </Section>

          <Section id="attribution" title="模块五 · 转化归因">
            <h3 className="text-base font-medium">D6 决策:多钩子,不依赖前台问话</h3>
            <p>
              传统归因靠"前台问每个患者怎么知道我们的"—— 实际执行率不到 50%,数据缺失严重。
              我们用<strong>多钩子自动回流</strong>:每条 publish_task 自动 mint 2 个钩子(医生名 + 6 位暗号)。
              员工发布时附暗号,患者来店报暗号 → 系统反查到具体内容。
            </p>
            <h3 className="text-base font-medium">单内容 ROI</h3>
            <p>
              attribution 页底部"单内容回流"列出每条 content_item 的发布次数 / 触发钩子数 / 各 stage 转化数。
              这是评估"哪些内容真值得继续做"的核心数据 —— 引用率高、SOV 高,但患者不来店,可能是品牌定位有问题;
              引用低但来店多,可能是私域力量推动。
            </p>
            <h3 className="text-base font-medium">前端登记入口</h3>
            <p className="text-sm">
              患者用的是 <code>/c/{tenant.slug}/checkin</code> 页(无需登录,可挂到大堂二维码 / 企微小卡片)。
              填暗号 + 阶段(到店 / 咨询 / 治疗)→ 提交。系统去重 (hook_id, stage),重复提交不会双计。
            </p>
          </Section>

          <Section id="faq" title="常见问题">
            <h3 className="text-base font-medium">为什么不用 ChatGPT 而用豆包?</h3>
            <p className="text-sm">
              首客是中国大陆品牌,目标人群在中国大陆。豆包占国内 AI 助手日活 60%+,远超 ChatGPT。
              GEO 价值在哪里看得到品牌就在哪里追,V2 加元宝 / 夸克 / DeepSeek 等多引擎对齐。
            </p>
            <h3 className="text-base font-medium">数据存哪?会泄露吗?</h3>
            <p className="text-sm">
              所有数据存自托管 Supabase(阿里云杭州),数据库表加 Row-Level Security,
              租户间物理隔离(见 ADR-001)。患者信息只存暗号,不存姓名 / 身份证 / 联系方式。
            </p>
            <h3 className="text-base font-medium">合规审核误判了怎么办?</h3>
            <p className="text-sm">
              人工复核可以「通过」否决 LLM 判定。所有动作写 audit_logs。
              如果 A 级误判频繁(如医院全名含"协和"被关键词命中),可在 settings → 合规词库做租户级豁免。
            </p>
            <h3 className="text-base font-medium">某员工请假能跳过吗?</h3>
            <p className="text-sm">
              在 settings → 员工管理把 status 改为 paused,派单算法自动跳过。请假完改回 active。
            </p>
          </Section>

          <Section id="decisions" title="关键决策(ADR)">
            <p>所有非显然的设计决策都写进 <code>docs/adr/</code>,以防"为什么这么做"被遗忘。</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li><strong>ADR-001</strong> RLS 策略 — 多租户物理隔离</li>
              <li><strong>ADR-002</strong> GEO 追踪解析策略 — 品牌 NER 为主,citation URL 为辅</li>
              <li><strong>ADR-003</strong> Supabase 自托管到阿里云 — 出境合规驱动</li>
              <li><strong>D5</strong> 合规三道门 vs 单纯关键词</li>
              <li><strong>D6</strong> 多钩子自动回流 vs 前台强制问话</li>
              <li><strong>D11</strong> 员工端 phone+passcode vs Supabase Auth</li>
            </ul>
          </Section>

          <p className="border-t border-border pt-6 text-xs text-muted-foreground">
            找不到答案?
            <Link
              href="https://github.com/anthropics/claude-code/issues"
              className="ml-1 underline-offset-2 hover:underline"
            >
              提个 issue
            </Link>
            ,或在概览页直接联系开发(我)。
          </p>
        </article>
      </div>
    </div>
  );
}

const TOC: Array<{ id: string; label: string }> = [
  { id: 'overview', label: '产品全景' },
  { id: 'content', label: '一 · 内容生产' },
  { id: 'compliance', label: '二 · 合规审核' },
  { id: 'publish', label: '三 · 派单 + 员工' },
  { id: 'tracking', label: '四 · GEO 追踪' },
  { id: 'attribution', label: '五 · 转化归因' },
  { id: 'faq', label: 'FAQ' },
  { id: 'decisions', label: '关键决策' },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground">{children}</div>
    </section>
  );
}
