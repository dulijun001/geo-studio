# UI 全面体检(2026-07-04)

> 双路证据:生产环境真实截图 10 页(ECS CloakBrowser 登录后逐页,桌面 1440 + 移动 390)+ 代码层扫描(49 个 page.tsx 全量)。
> 标尺 = 用户自定交互原则:为目标设计 / 不让用户思考 / 系统承担复杂性 / 渐进式展示 / 反馈引导行动。

## 总评

**空态文案和 pending 态是这套 UI 的真本事**(空态覆盖近 100% 且带行动指引,useTransition 40 文件/disabled 72 处)——多数成熟产品做不到。**真正的短板集中在四类:错误态为零、管理后台手机端表格必坏、反馈模式三套并存、信息过载(17 项导航/巨长列表/99+ 积压)。**

## 🔴 P0 系统性风险(半天内可修完)

| # | 问题 | 证据 | 修法 | 工时 |
|---|---|---|---|---|
| 1 | **全应用 0 个 error.tsx** — 任何 RSC 抛错(Supabase 断连/ARK 欠费,已发生 4 次)= Next 默认英文白屏,无重试无返回 | `find app -name error.tsx` = 0 | `app/t/[slug]/error.tsx` + `global-error.tsx`,带重试按钮 | 0.5h |
| 2 | **daily-ops 把英文技术日志怼给客户**:"batch finished with 0 successful items (batch.status=failed, 17/17 failed)",下方整屏黑空白,无重试无指引 | 生产截图 02(2026-07-04 实拍) | 错误分类翻译(欠费→"账户欠费,[去充值],充值后自动恢复")+ 失败态给重试按钮 | 2h |
| 3 | **管理后台手机端表格必坏**:admin-shell `overflow-x-hidden`(:64)主动禁横滚;14 个表格页仅 3 处 `overflow-x-auto`,其余 `overflow-hidden` 直接裁掉操作列;问题库固定 7 列 grid 496px 超手机屏(questions-ui.tsx:138) | S2/S3 全 file:line 在代理报告 | 批量 overflow-hidden→overflow-x-auto + admin-shell 修正 | 1-2h |

## 🟡 P1 一致性与过载(一周内)

| # | 问题 | 证据 | 修法 | 工时 |
|---|---|---|---|---|
| 4 | **反馈三套并存**:失败=原生 alert 抛英文 Error.message ×8 处,成功=inline state,确认=原生 confirm ×14 处;全 app toast=0;shadcn components/ui 已装但零消费(且用户 WIP 的 layout.tsx Geist 导入把本地 dev 搞挂——Next 14 需用 geist npm 包) | M1/M3/L5 | 修 Geist → 落地 shadcn Button + 统一 toast,替换 alert/confirm | 1d |
| 5 | **合规详情页浅色残留**(暗色页面上 emerald-50 浅绿便利贴,客户管理员每天必看的页面)+ 死 hover(hover 色=本体色 ×3)+ 侧栏 hover 反向变暗(slate-600<slate-400) | M2/M4/M5 file:line | 批量替换 | 0.5d |
| 6 | **合规 99+ 积压徽章**:UI 封顶掩盖真实规模(实际已数百),队列页无批量操作;运营层面人审流程失控(D49 地板会继续加压) | 生产截图 02 侧栏 | 真数徽章 + 批量审批/拒绝 + 积压治理(产品+运营双侧) | 1d |
| 7 | **17 项导航平铺无分组**(客户原话"各自孤岛",docs/08);NEW 徽章永不过期(5 月功能还挂 NEW);⌘K HINTS 漏 daily-ops | M6/L6/L7 | 分 4 组:运营(每日自动化/派单/合规)/洞察(回路/SOV/追踪/归因)/内容资产(内容/救援/问题库/写作要求/关键词/引用源)/配置;NEW 加过期 | 0.5d |
| 8 | **追踪/合规巨长列表无分页**(fullPage 截图高到不可读;几百行一次渲染) | 生产截图 06/07 | 分页 + 状态/引擎筛选 | 1d |

## 🟢 P2 打磨批

- 概览巨型"100.0%"恒绿英雄区(不变的数字不值 1/4 屏)→ 换"今日待办"(待审 N/告警 N/失败 N),黄金位给行动
- 内容库 ~100 行同前缀标题("昆明西山区…")扫读失效 → 弱化公共前缀+按批次分组+状态 tab
- 员工登录页"忘记密码"死文本 → 给可点动作(复制求助话术);下半屏空白放引导
- 患者公开页(c/[slug]/checkin 等)无 loading/error——扫码转化页慢网白屏
- landing 占位残留(CASE/PRICING 注释标占位 + footer mailto:hello@geo-studio.cn 未验证邮箱,D41 漏网)
- 表单 label htmlFor 断链 ×2、emoji 状态图标无 aria-hidden、中文 9-10px 微字号 ×80 处
- loading 骨架"一屏走天下"且 grid-cols-4 无断点
- 回路看板平台表格无移动横滚容器(2026-07-03 新建时自带)
- landing 移动端 13040px 过长(非日常界面,最低优)

## 待用户确认

- daily-ops 四个状态卡图标在截图里是豆腐块(□)——可能仅 ECS 截图环境缺 emoji 字体,**需用户在自己设备确认**;若真机同样 → 换 SVG
- shadcn WIP 的意图(是否本就为统一组件库?若是,P1-4 顺势完成它)

## 做得好的(别动)

空态文案(带行动指引,非"暂无数据")/ pending 态覆盖 / 移动端侧栏抽屉(遮罩+aria)/ PageHeader 覆盖 33/35 / InlineGuide 27 页 / confirm 文案质量(写清软删后果,只是壳该换)
