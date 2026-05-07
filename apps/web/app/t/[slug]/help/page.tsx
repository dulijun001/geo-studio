import Link from 'next/link';
import { requireTenantMember } from '@/lib/tenant';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function HelpPage({ params }: { params: { slug: string } }) {
  const tenant = await requireTenantMember(params.slug);
  const t = `/t/${tenant.slug}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="使用手册"
        subtitle="GEO Studio 怎么用 · 每个模块在做什么 · 在哪里能看到 · 常见疑惑"
      />

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
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

        <article className="prose prose-slate max-w-none space-y-12">

          <Section id="overview" title="GEO Studio 在解决什么问题">
            <p>
              <strong>GEO(Generative Engine Optimization)</strong> 是 SEO 之后的下一个流量入口。
              当用户问"南京种植牙推荐哪家"时,他们越来越多在豆包、元宝、ChatGPT 里直接问,
              不是去百度。<strong>答案里出现的医院名字,就是这个时代的"自然搜索结果"。</strong>
            </p>
            <p>GEO Studio 把六件事串成一条流水线,让品牌在 AI 答案里被系统性地提到 / 引用 / 推荐:</p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li><strong>内容生产</strong> — 三种入口(上传 / AI 起草 / 反向问题→选题),按 GEO 9 法生成多平台变体,自动打分,低分自动改写</li>
              <li><strong>合规审核</strong> — 四道门:关键词 + LLM 语义 + 历史案例匹配 + 人工复核</li>
              <li><strong>派单 + 员工矩阵</strong> — 40 人真人发布,反爬绝缘,自带暗号闭环</li>
              <li><strong>GEO 追踪</strong> — Playwright 模拟真人在豆包 / 元宝 / DeepSeek Web 抓真实答案</li>
              <li><strong>SOV 战况 + Playbook</strong> — 8 周热力图看趋势,豆包 8 周路线图给行动</li>
              <li><strong>转化归因</strong> — 多钩子自动回流 + 三模型客户旅程,告诉你哪条内容真带客</li>
            </ol>
            <p className="text-sm text-muted-foreground">
              市面上的 GEO 工具大多只做 1 或 4。GEO Studio 做完整闭环——这是和竞品的核心差异。
            </p>
          </Section>

          <Section id="quickstart" title="快速上手 · 5 分钟摸清">
            <p>第一次进来,按这个顺序点一遍,你会知道每个模块在哪、产出什么。</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                打开 <Path href={t}>{t}</Path> 总览页 — 看四个核心数:本周发布数 / 合规通过率 / 引用率(SOV) / 转化数
              </li>
              <li>
                <Path href={`${t}/settings/knowledge`}>设置 → 知识库</Path> — 上传医生写的科普 / 临床指南 / 病例(脱敏),
                这是后面所有内容的"上游水源"。<strong>这一步没做,后面 AI 起草的质量就上不来</strong>
              </li>
              <li>
                <Path href={`${t}/settings/geo-checklist`}>设置 → GEO 体检表</Path> — 勾选品牌当前的 GEO 基础设施(百度百科 / 搜狗百科 / 高德 POI / 大众点评等),
                豆包答案里的引用来源大多在这几张牌里
              </li>
              <li>
                <Path href={`${t}/content`}>内容</Path> — 上传一篇科普 → 解析 → 选平台 → 生成变体 → 看分数 →
                <Path href={`${t}/compliance`}>合规</Path>
                  → 通过的进 <Path href={`${t}/publish`}>派单</Path>
              </li>
              <li>
                <Path href={`${t}/tracking`}>GEO 追踪</Path> — 当下快照,看每条 query 的引用情况;
                <Path href={`${t}/sov`}>SOV</Path> 看 8 周趋势,有热力图
              </li>
              <li>
                等内容发出去一两周后,<Path href={`${t}/attribution`}>转化归因</Path> 会显示哪条内容带来了到店,
                单内容 ROI 表是评估"什么值得继续做"的核心
              </li>
            </ol>
            <Tip>
              一个常见迷路:你看不到任何数据。检查两件事 — (a) <Path href={`${t}/settings/staff`}>员工管理</Path> 是否至少有 1 个 active 员工;
              (b) 是否上传过任意一篇内容。两个为零,所有 dashboard 都是空的。
            </Tip>
          </Section>

          <Section id="content" title="模块一 · 内容生产">
            <h3>三种入口,怎么选</h3>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>上传素材</strong>(主路径)— 上传 Word / PDF / Markdown / 纯文本,系统异步解析为 markdown。
                适用于"医生写好稿子让我们多平台发"的场景</li>
              <li><strong>AI 起草</strong> — 给个标题 + 几个关键词,豆包基于 KB 直接生成第一稿。
                适用于"今天有热点要快速跟"或"医生没空写"的场景</li>
              <li><strong>反向工作流(query → matrix)</strong> — 你输入"竞品出现了哪些 query 但我们没出现",
                系统反推应该写哪些选题。适用于"被竞品超过想抢回来"的场景</li>
            </ul>

            <h3>变体生成 + 评分</h3>
            <p>选目标平台(头条号 / 抖音 / 知乎 / 公众号 / 小红书 ...),系统按 <strong>GEO 9 法</strong>(权威引用、统计数据、列表化、流畅度等)生成 N 个变体,
              每条变体跑一次 rule-based 评分(0-100),并诊断哪几条法则达标 / 失分。</p>
            <p className="text-sm text-muted-foreground">
              单次 LLM 调用 60-130s,走 worker 进程,不卡 web。并行多平台时 worker 用 <code>Promise.allSettled</code>,约 2 分钟出全套。
            </p>

            <h3>低分自救:rescue 页</h3>
            <p>评分 &lt; 80 的变体,系统自动用"针对性弱项 hint"再写一次。仍然过不了 80 分的,会被收进
              <Path href={`${t}/content/rescue`}>内容 → 老内容效果迭代</Path> 列表 — 一键"AI 救援"重写,产出新变体走完整合规流程。</p>
            <p className="text-sm">入选 rescue 的两类:① 评分 &lt; 80;② 已发布 &gt; 30 天但 0 引用。</p>

            <h3>引用守卫</h3>
            <p>豆包生成时会"幻觉"引用——杜撰不存在的论文 / 数据 / 报告。我们做了两层防护:</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li><strong>幻觉检查</strong>:对每条 citation 做存在性 + 来源真实性核查,可疑的标红</li>
              <li><strong>verified-citations 白名单</strong>:管理员预先维护"我们认可的来源"(JCR 期刊 / 卫健委 / 行业协会等),命中白名单 ✓ 标记</li>
            </ol>

            <Where>
              主操作 <Path href={`${t}/content`}>{t}/content</Path> · 老内容迭代 <Path href={`${t}/content/rescue`}>{t}/content/rescue</Path>
            </Where>
          </Section>

          <Section id="compliance" title="模块二 · 合规审核(四道门)">
            <p>
              医疗广告法对绝对化用语 / 治愈承诺 / 患者照片 / 专家排名等有明确禁用,
              违规处罚<strong>十万起步</strong>。我们用四道门覆盖不同风险层:
            </p>
            <div className="space-y-2 rounded-md bg-muted/50 p-4 text-sm">
              <p>
                <strong>第一道 · 关键词扫描</strong>(同步,&lt;50ms)。A 级直接拒(根治、永不复发、第一、最好...),
                B 级警告(领先、首选、值得信赖...)。<strong>关键词按平台作用域</strong> — 同一个词在抖音和小红书风险等级可能不同(D12)。
              </p>
              <p>
                <strong>第二道 · LLM 语义审查</strong>(豆包,异步 &lt;3s)。读上下文判断,关键词命中也可能因为是反例引用而通过。
              </p>
              <p>
                <strong>第三道 · 历史案例匹配</strong>(向量检索,异步)。把当前文案对照 <code>compliance_cases</code> 表里的真实罚单做相似度匹配,
                有过往真实案例做锚点而不是只靠抽象关键词或 LLM 主观(D12)。
              </p>
              <p>
                <strong>第四道 · 管理员人工复核</strong>。前三道里 B 级 + LLM/案例不确定的都进这里。中位 SLA &lt;2 小时。
              </p>
            </div>
            <p className="text-sm">所有审核行为写 <code>audit_logs</code>,保留 ≥ 3 年(医疗广告法诉讼时效)。</p>

            <h3>合规词库:租户级豁免 + 人工补充</h3>
            <p className="text-sm">
              误判频繁(如医院全名含"协和"被关键词命中)→ 在
              <Path href={`${t}/settings/vocab`}>设置 → 合规词库</Path>
              加租户级豁免 / 自定义。词库会被 KB 同步增量更新,不会丢。
            </p>

            <Where>
              审核队列 <Path href={`${t}/compliance`}>{t}/compliance</Path> ·
              词库 <Path href={`${t}/settings/vocab`}>{t}/settings/vocab</Path> ·
              审计日志 <Path href={`${t}/settings/audit`}>{t}/settings/audit</Path>
            </Where>
          </Section>

          <Section id="publish" title="模块三 · 派单 + 员工矩阵">
            <h3>为什么不自动发布</h3>
            <p>
              头条 / 抖音 / 小红书对自动化检测严格 — 自动发 = 集体封号 + 法律风险。
              我们坚持<strong>员工真人发布</strong>:派单算法只决定"谁发什么",发布动作员工手工完成。
              这条逻辑写进 D3 决策,不会推翻。
            </p>

            <h3>派单算法考虑的四个维度</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li><strong>平台匹配</strong> — 员工只发自己有账号的平台</li>
              <li><strong>人设匹配</strong> — 种植牙变体派给种植专家,儿牙变体派给儿牙医生(基于 KB 里的医生标签)</li>
              <li><strong>节奏</strong> — 每人每天 ≤ 2 条,避免突击式发布被算法判机器</li>
              <li><strong>新颖度</strong> — 同员工不连发相似内容</li>
            </ul>

            <h3>员工怎么登录(D11)</h3>
            <p className="text-sm">
              员工没邮箱,V1 用<strong>手机号 + 密码</strong>(管理员发一次性链接,员工自己设密码)或 <strong>6 位 passcode</strong>(管理员手发,一次性)。
              员工端在 <Path href="/staff">/staff</Path>,使用手册在 <Path href="/staff/help">/staff/help</Path>(对外公开,免登录可读)。
              V1 收尾切阿里云 SMS OTP — 表结构不变。
            </p>

            <h3>员工管理</h3>
            <p className="text-sm">
              加员工 / 改 status / 派账号在 <Path href={`${t}/settings/staff`}>设置 → 员工管理</Path>。
              请假 → status 改 paused,派单算法自动跳过。
            </p>

            <Where>
              派单看板 <Path href={`${t}/publish`}>{t}/publish</Path> ·
              员工管理 <Path href={`${t}/settings/staff`}>{t}/settings/staff</Path>
            </Where>
          </Section>

          <Section id="tracking" title="模块四 · GEO 追踪(多引擎)">
            <h3>为什么不直接调豆包 / 元宝 API(D4 / D8)</h3>
            <p>
              这些 API 返回的是<strong>纯 LLM 答案</strong>,不带 RAG 检索层 — 和真实用户在 App / Web 看到的答案<strong>完全不同</strong>。
              真用户看到的有知识卡片、搜索引文、公关词条;API 看到的是干净的语言模型生成。
              所以追踪必须模拟真人:Playwright + 系统 Chrome + 反指纹检测。
            </p>

            <h3>多引擎 dispatcher</h3>
            <p>当前在线的 web adapter:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li><strong>豆包 Web</strong>(主力,选择器对真实 DOM 校验过)</li>
              <li><strong>元宝 Web</strong>(scaffold,V2 完善)</li>
              <li><strong>DeepSeek Web</strong>(scaffold,V2 完善)</li>
              <li>夸克 / Kimi / 通义 / 文心 — V2 路线图,见 ADR-004</li>
            </ul>

            <h3>解析策略</h3>
            <p>
              豆包游客模式答复<strong>通常没有显式引用 URL</strong>,品牌名出现在纯文本里。所以主信号是
              <strong>品牌词典 NER</strong>(基于 brand_vocab):本品牌 / 竞品 / 医生名 / 城市 / 服务名都打进字典,
              对答复全文做关键词命中。citation URL 命中 verified-citations 白名单时给 bonus。完整推理见 ADR-002。
            </p>

            <h3>V1 限制</h3>
            <p className="text-sm text-muted-foreground">
              同 IP 短时高频请求会被豆包静默限流(不弹验证码、不报错,就是不渲染答复)。
              V1 半自动每周跑一次 baseline 足矣;V2 加代理池 + 账号池 + 指纹隔离支持 7×24 自动追踪(ADR-004)。
            </p>

            <Where>
              当前快照 <Path href={`${t}/tracking`}>{t}/tracking</Path>
            </Where>
          </Section>

          <Section id="sov" title="模块五 · SOV 战况图 + Playbook">
            <h3>SOV 8 周热力图</h3>
            <p>
              "GEO 追踪"看的是<strong>当前快照</strong>,SOV 看的是<strong>趋势</strong>。
              过去 8 周 × 每条 query 画成热力图,每个 cell 五种状态:
            </p>
            <div className="space-y-1 rounded-md bg-muted/50 p-4 text-sm">
              <p>✅ <strong>守住</strong> — 本品牌 ≥ 1 mention,竞品 0</p>
              <p>⚔️ <strong>拉锯</strong> — 本品牌 ≥ 1,竞品也 ≥ 1</p>
              <p>🔴 <strong>失守</strong> — 本品牌 0,竞品 ≥ 1</p>
              <p>⚪ <strong>真空</strong> — snapshot 跑过但没人被提</p>
              <p>— <strong>无数据</strong> — 当周没跑过 baseline</p>
            </div>
            <p className="text-sm">
              周报基线由 cron 自动跑(每周一早 9:00 北京时间),发不到看不见 → 检查 worker 是否在 PM2 里 online。
            </p>

            <h3>豆包 GEO Playbook</h3>
            <p>
              <Path href={`${t}/playbook`}>{t}/playbook</Path>
              是一份 8 周阶段化路线图,告诉你"在 GEO 这件事上,从 0 到运营成熟该怎么走":每个阶段对应平台优先级、
              产出节奏、合规重点。每条阶段都关联本租户当下的真实数据(KB 进度 / 内容产出 / SOV 趋势),
              不是死的咨询模板。
            </p>

            <Where>
              <Path href={`${t}/sov`}>{t}/sov</Path> · <Path href={`${t}/playbook`}>{t}/playbook</Path>
            </Where>
          </Section>

          <Section id="attribution" title="模块六 · 转化归因">
            <h3>D6 决策 · 多钩子自动回流</h3>
            <p>
              传统归因靠"前台问每个患者怎么知道我们的"—— 实际执行率不到 50%。
              我们用<strong>多钩子自动回流</strong>:每条 publish_task 自动 mint 两个钩子(医生名 + 6 位暗号),
              员工发布时附暗号,患者来店报暗号 → 系统反查到具体内容。
            </p>

            <h3>客户旅程 + 三模型对比</h3>
            <p>多触点的客户(看了 5 条内容才到店),"哪条内容的功劳"用三种归因模型并排展示:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li><strong>linear</strong> — 平均分配,公平</li>
              <li><strong>time_decay</strong> — 越靠近转化时间权重越高</li>
              <li><strong>position_based</strong> — 首尾触点高权重(40%/40%),中间分剩下 20%</li>
            </ul>
            <p className="text-sm">点旅程 [id] 进详情页能看完整时间线 + 三模型 credit 分配。</p>

            <h3>单内容 ROI</h3>
            <p>
              attribution 页底部"单内容回流"列出每条 content_item 的发布次数 / 触发钩子数 / 各阶段转化数。
              这是评估"哪些内容真值得继续做"的核心数据。两个反直觉信号:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>引用率高 / SOV 高,但患者不来店 → 可能是品牌定位 / 客单价匹配有问题</li>
              <li>引用低但来店多 → 可能是私域 / 转介绍力量推动,内容不是关键</li>
            </ul>

            <h3>前端登记入口</h3>
            <p className="text-sm">
              患者用的是 <code>/c/{tenant.slug}/checkin</code> 页(无需登录,可挂大堂二维码 / 企微小卡片)。
              填暗号 + 阶段(到店 / 咨询 / 治疗)→ 提交。系统按 (hook_id, stage) 去重,重复提交不会双计。
            </p>

            <Where>
              <Path href={`${t}/attribution`}>{t}/attribution</Path>
            </Where>
          </Section>

          <Section id="kb" title="模块七 · 知识库 + GEO 体检表">
            <h3>知识库(KB)是上游水源</h3>
            <p>
              KB 不是个文件柜 — 它是<strong>整个内容生产 + 派单 + 合规的真实数据源</strong>。
              一个文件进 KB 后,系统会:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>每 5 分钟扫描 hash 差异,自动重建 → 合规词库 / 医生标签 / 品牌词典 / 平台风格</li>
              <li>AI 起草 / 变体改写时把 KB 上下文作为权威来源,降低幻觉</li>
              <li>引用守卫的 verified-citations 白名单也从 KB 派生</li>
            </ol>
            <p className="text-sm">
              <strong>实操建议</strong>:开局至少 20 篇科普 / 临床指南 / 病例,后续每周补 5-10 篇。
              太少 → AI 写出来的稿都像 ChatGPT 默认味;太陈旧 → 信息过时风险。
            </p>

            <h3>GEO 体检表</h3>
            <p>
              豆包 / 元宝 答案里出现的"引用来源",90% 来自这几张牌:百度百科、搜狗百科、高德 POI、百度地图 POI、大众点评分数 / 评价数。
              <Path href={`${t}/settings/geo-checklist`}>设置 → GEO 体检表</Path> 让你勾选 + 维护这些"基础设施"的当下状态。
              没建百科 → 在豆包答案里几乎拿不到品牌引用,这是先行条件。
            </p>

            <Where>
              知识库 <Path href={`${t}/settings/knowledge`}>{t}/settings/knowledge</Path> ·
              GEO 体检 <Path href={`${t}/settings/geo-checklist`}>{t}/settings/geo-checklist</Path>
            </Where>
          </Section>

          <Section id="faq" title="常见问题">
            <h3>为什么不用 ChatGPT 而用豆包?</h3>
            <p className="text-sm">
              首客是中国大陆品牌,目标人群在大陆。豆包占国内 AI 助手日活 60%+,远超 ChatGPT。
              GEO 价值在哪里看得到品牌就在哪里追,V2 加元宝 / 夸克 / DeepSeek 等多引擎对齐(ADR-004)。
            </p>

            <h3>数据存哪?会泄露吗?</h3>
            <p className="text-sm">
              所有数据存自托管 Supabase(阿里云杭州,D13 + ADR-003),数据库表加 Row-Level Security(ADR-001),
              租户间物理隔离。患者信息只存暗号,不存姓名 / 身份证 / 联系方式。
            </p>

            <h3>合规审核误判了怎么办?</h3>
            <p className="text-sm">
              人工复核可以"通过"否决前三道门的判定。所有动作写 audit_logs。
              A 级误判频繁的,在
              <Path href={`${t}/settings/vocab`}>合规词库</Path>
              做租户级豁免。历史案例匹配的判定也可以由人工复核反向标注"非真实风险",回流到向量库提升后续准确度。
            </p>

            <h3>某员工请假能跳过吗?</h3>
            <p className="text-sm">
              在 <Path href={`${t}/settings/staff`}>员工管理</Path> 把 status 改为 paused,派单算法自动跳过。请假完改回 active。
            </p>

            <h3>低分变体被自动改写,我能否决吗?</h3>
            <p className="text-sm">
              改写产出的是<strong>新变体</strong>,旧变体保留。所有变体在 content/[id] 详情页能看到完整谱系,
              你可以选一条"采用",其他不删,以后回看哪个版本效果好。
            </p>

            <h3>GEO 追踪一条 query 跑一次要多久?</h3>
            <p className="text-sm">
              单条 query 在豆包 Web 上跑大约 30-90 秒(模拟真人输入 + 等流式回答完成 + 解析)。
              一周一轮 baseline,假设你有 20 条 query,Worker 一次跑约 15-30 分钟,可控。
            </p>
          </Section>

          <Section id="decisions" title="关键决策(ADR + D 编号)">
            <p>所有非显然的设计决策都写进 <code>docs/adr/</code> 和 <code>CLAUDE.md</code> 第三节,以防"为什么这么做"被遗忘。</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li><strong>D1 / D2</strong> 多租户架构 + 租户配置化(不写 if industry === 'dental')</li>
              <li><strong>D3</strong> 不自动化提交到头条 / 抖音 — 实名号封号 + 法律风险</li>
              <li><strong>D4 / D8</strong> GEO 追踪走 Playwright 不走豆包 API — API 不带 RAG,看不到真实答案</li>
              <li><strong>D5 + D12</strong> 合规四道门 — 关键词 + LLM + 历史案例 + 人工(早期是三道门,V1.6 升级)</li>
              <li><strong>D6</strong> 多钩子自动回流 vs 前台强制问话</li>
              <li><strong>D7</strong> 技术栈锁定:Next 14 + Supabase + Drizzle + Playwright + pgvector</li>
              <li><strong>D9</strong> 绝不存储员工的头条 / 抖音账号登录凭证</li>
              <li><strong>D10</strong> 每条 DB 变更走 migration,不在生产手改 schema</li>
              <li><strong>D11</strong> 员工端 phone+passcode 自建 session,不走 Supabase Auth</li>
              <li><strong>D13</strong> Supabase 自托管到阿里云国内 — 出境合规 + 延迟双解</li>
              <li><strong>ADR-001</strong> RLS 策略 — 多租户物理隔离</li>
              <li><strong>ADR-002</strong> GEO 追踪解析:品牌 NER 为主,citation URL 为辅</li>
              <li><strong>ADR-003</strong> Supabase 自托管的具体方案</li>
              <li><strong>ADR-004</strong> V2 反爬基础设施(代理池 / 账号池 / 指纹隔离)</li>
            </ul>
          </Section>

          <p className="border-t border-border pt-6 text-xs text-muted-foreground">
            找不到答案?直接联系开发(我)。所有决策的"为什么"在
            <code className="ml-1">docs/adr/</code> 和
            <code className="ml-1">CLAUDE.md</code>。
          </p>
        </article>
      </div>
    </div>
  );
}

const TOC: Array<{ id: string; label: string }> = [
  { id: 'overview', label: '产品全景' },
  { id: 'quickstart', label: '快速上手 5 分钟' },
  { id: 'content', label: '一 · 内容生产' },
  { id: 'compliance', label: '二 · 合规四道门' },
  { id: 'publish', label: '三 · 派单 + 员工' },
  { id: 'tracking', label: '四 · GEO 追踪' },
  { id: 'sov', label: '五 · SOV + Playbook' },
  { id: 'attribution', label: '六 · 转化归因' },
  { id: 'kb', label: '七 · 知识库 + 体检表' },
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

function Where({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.10] px-3 py-2 text-xs text-emerald-200">
      <span className="font-medium">在 GEO Studio 哪里看 · </span>
      {children}
    </p>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border-l-2 border-emerald-500/40 bg-sky-500/[0.10] px-3 py-2 text-xs text-sky-300">
      <span className="font-medium">提示 · </span>
      {children}
    </p>
  );
}

function Path({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
