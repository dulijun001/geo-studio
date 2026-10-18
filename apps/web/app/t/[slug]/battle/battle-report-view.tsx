'use client';

import { useState } from 'react';
import Link from 'next/link';

interface CompetitorStat {
  rank: string;
  name: string;
  isSelf?: boolean;
  total: number;
  sample: number;
  sov: string;
  doubao: string;
  doubaoCount: number;
  deepseek: string;
  deepseekCount: number;
  yuanbao: string;
  yuanbaoCount: number;
  status: string;
}

const COMPETITOR_STATS: CompetitorStat[] = [
  {
    rank: 'TOP 1',
    name: '松鼠口腔（本院）',
    isSelf: true,
    total: 108,
    sample: 199,
    sov: '54.3%',
    doubao: '84.5%',
    doubaoCount: 87,
    deepseek: '22.9%',
    deepseekCount: 11,
    yuanbao: '20.8%',
    yuanbaoCount: 10,
    status: '豆包端绝对统治；DeepSeek与元宝端偏弱，元宝被柏德反超',
  },
  {
    rank: 'TOP 2',
    name: '柏德口腔（头号竞品）',
    total: 56,
    sample: 199,
    sov: '28.1%',
    doubao: '30.1%',
    doubaoCount: 31,
    deepseek: '20.8%',
    deepseekCount: 10,
    yuanbao: '31.3%',
    yuanbaoCount: 15,
    status: '靠知乎专栏与搜狐号在元宝端逆袭反超，垄断泛昆明大词',
  },
  {
    rank: 'TOP 3',
    name: '德韩口腔',
    total: 33,
    sample: 199,
    sov: '16.6%',
    doubao: '19.4%',
    doubaoCount: 20,
    deepseek: '12.5%',
    deepseekCount: 6,
    yuanbao: '14.6%',
    yuanbaoCount: 7,
    status: '主打集采低价与多院区连锁，在价格类问答中持续分流',
  },
  {
    rank: 'TOP 4',
    name: '泰康拜博口腔',
    total: 25,
    sample: 199,
    sov: '12.6%',
    doubao: '14.6%',
    doubaoCount: 15,
    deepseek: '8.3%',
    deepseekCount: 4,
    yuanbao: '12.5%',
    yuanbaoCount: 6,
    status: '老牌连锁，覆盖全城泛词，但缺乏深度专业内容沉淀',
  },
  {
    rank: 'TOP 5',
    name: '美奥口腔',
    total: 23,
    sample: 199,
    sov: '11.6%',
    doubao: '11.7%',
    doubaoCount: 12,
    deepseek: '6.3%',
    deepseekCount: 3,
    yuanbao: '16.7%',
    yuanbaoCount: 8,
    status: '聚焦低价种牙与学生正畸分期，元宝提及率较高',
  },
  {
    rank: 'TOP 6',
    name: '昆明蓝橙口腔',
    total: 17,
    sample: 199,
    sov: '8.5%',
    doubao: '3.9%',
    doubaoCount: 4,
    deepseek: '16.7%',
    deepseekCount: 8,
    yuanbao: '10.4%',
    yuanbaoCount: 5,
    status: '在儿牙早期矫治与窝沟封闭题库中高频出现，威胁儿牙防线',
  },
  {
    rank: 'TOP 7',
    name: '尚爱韩美口腔',
    total: 15,
    sample: 199,
    sov: '7.5%',
    doubao: '7.8%',
    doubaoCount: 8,
    deepseek: '4.2%',
    deepseekCount: 2,
    yuanbao: '10.4%',
    yuanbaoCount: 5,
    status: '主打韩国登腾3800元集采低价，拦截价格敏感型患者',
  },
  {
    rank: 'TOP 8',
    name: '团圆口腔',
    total: 8,
    sample: 199,
    sov: '4.0%',
    doubao: '4.9%',
    doubaoCount: 5,
    deepseek: '4.2%',
    deepseekCount: 2,
    yuanbao: '2.1%',
    yuanbaoCount: 1,
    status: '二级专科医院资质，在少量儿牙与急诊场景露脸',
  },
  {
    rank: 'TOP 9',
    name: '亿大口腔',
    total: 3,
    sample: 199,
    sov: '1.5%',
    doubao: '2.9%',
    doubaoCount: 3,
    deepseek: '0.0%',
    deepseekCount: 0,
    yuanbao: '0.0%',
    yuanbaoCount: 0,
    status: '仅豆包有微弱抓取，整体近乎无 GEO 权重',
  },
];

const CITATION_DOMAINS = [
  { rank: 1, name: '牙舒丽网', domain: 'm.yslw.com / www.yslw.com', count: 295, engine: '豆包核心源', tag: '价格表/口碑评价/种牙案例' },
  { rank: 2, name: '抖音网页端', domain: 'www.iesdouyin.com', count: 216, engine: '豆包高频源', tag: '60s短视频字幕/标题/评论区问答' },
  { rank: 3, name: '今日头条', domain: 'm.toutiao.com', count: 97, engine: '豆包主力', tag: '员工矩阵疑问句长文(收录快3-7天)' },
  { rank: 4, name: '搜狐健康', domain: 'm.sohu.com / www.sohu.com', count: 64, engine: 'DeepSeek/豆包', tag: '搬迁公告/全城口腔红黑榜' },
  { rank: 5, name: '省/市医保局官网', domain: 'ybj.km.gov.cn / ylbz.yn.gov.cn', count: 52, engine: 'DeepSeek/元宝', tag: '种植牙集采调控/医保个账刷卡' },
  { rank: 6, name: '知乎专栏与问答', domain: 'zhuanlan.zhihu.com / zhihu.com', count: 38, engine: 'DeepSeek/元宝', tag: '1500字深度长文/医生履历(柏德阵地)' },
  { rank: 7, name: '卫健委与西山区政府网', domain: 'wsjkw.km.gov.cn / kmxs.gov.cn', count: 31, engine: 'DeepSeek权威', tag: '执业登记公示/窝沟封闭定点名单' },
  { rank: 8, name: '皓齿口腔网', domain: 'm.hnqnw.com', count: 26, engine: '豆包垂直', tag: '昆明牙科收费价目表/拔智齿测评' },
  { rank: 9, name: '开立特口腔网', domain: 'm.kelete.com', count: 19, engine: '豆包垂直', tag: '就诊亲测体验/收费透明度评级' },
  { rank: 10, name: '398口腔 / 360视界', domain: 'kq.360tulou.com / 398.cn', count: 18, engine: '豆包/DeepSeek', tag: '医院资质核验/许可证号查询' },
  { rank: 11, name: '松鼠口腔官网', domain: 'www.songskq.com / 3g.songskq.com', count: 11, engine: '豆包', tag: '儿牙涂氟专题/全瓷牙质保体系' },
];

const RISKS = [
  {
    level: 'red',
    title: '⚠️ 搬迁老地址残留隐患',
    desc: '豆包与元宝因抓取牙舒丽网 6 月份旧缓存，部分问答仍在指引患者去「老海埂路蓝光昆仑中心3楼」，导致到院流失。',
    action: '一键派发牙舒丽与地图地址更新核对，压制旧地址收录。',
  },
  {
    level: 'yellow',
    title: '⚠️ 泛昆明大词防御空虚',
    desc: '提问未带「西山区」前缀（如《昆明哪家医院矫正牙齿比较好》），AI 优先推荐柏德与公立，松鼠在泛全城词处于弱势。',
    action: '强化今日头条与搜狐健康矩阵号，加大全城级核心大词密度。',
  },
  {
    level: 'yellow',
    title: '⚠️ 知乎高权重长文阵地被柏德垄断',
    desc: '知乎是 DeepSeek 与元宝的核心采信源，柏德在此深耕 1500 字以上测评，元宝端直接反超松鼠（31.3% vs 20.8%）。',
    action: '强制要求员工每周派单同步知乎专栏，补齐知乎内容短板。',
  },
];

export function BattleReportView({ tenantSlug }: { tenantSlug: string }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'engine' | 'sources' | 'risks'>('overview');

  return (
    <div className="space-y-6">
      {/* 顶部核心 KPI 卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-500/30 bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            全网品牌提及率 (SOV)
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-foreground">54.3%</span>
            <span className="text-xs font-medium text-emerald-400">全城 TOP 1</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">松鼠本院命中 108 / 199 轮多引擎真实测试</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            豆包端统治率
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-foreground">84.5%</span>
            <span className="text-xs font-medium text-emerald-400">87 / 103 题</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">西山区、儿牙、种植牙在豆包形成垄断壁垒</p>
        </div>

        <div className="rounded-xl border border-red-500/30 bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
            头号竞品柏德威胁
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-foreground">28.1%</span>
            <span className="text-xs font-medium text-red-400">元宝端 31.3%</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">柏德在元宝端反超本院（31.3% vs 20.8%）</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            已穿透引源规模
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-foreground">1,100+</span>
            <span className="text-xs font-medium text-muted-foreground">11 大阵地</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">真实外链经过 HTTP Live 穿透与权重核验</p>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="flex border-b border-border text-sm">
        <button
          onClick={() => setActiveTab('overview')}
          className={`border-b-2 px-4 py-2.5 font-medium transition-colors ${
            activeTab === 'overview'
              ? 'border-emerald-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🏆 全城声量对抗总榜
        </button>
        <button
          onClick={() => setActiveTab('engine')}
          className={`border-b-2 px-4 py-2.5 font-medium transition-colors ${
            activeTab === 'engine'
              ? 'border-emerald-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🤖 三大引擎采信拆解
        </button>
        <button
          onClick={() => setActiveTab('sources')}
          className={`border-b-2 px-4 py-2.5 font-medium transition-colors ${
            activeTab === 'sources'
              ? 'border-emerald-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🌐 Top 11 引源阵地穿透
        </button>
        <button
          onClick={() => setActiveTab('risks')}
          className={`border-b-2 px-4 py-2.5 font-medium transition-colors ${
            activeTab === 'risks'
              ? 'border-emerald-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🚨 业务隐患与反制预警
        </button>
      </div>

      {/* Tab 1: 全城声量对抗总榜 */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  全城 9 家口腔机构 SOV 对抗榜（199 轮多引擎真实测试）
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  基于 Playwright 自动化落盘快照统计：松鼠 54.3% 领跑，柏德 28.1% 位居次席，德韩 16.6% 截留低价
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                  <tr>
                    <th className="py-3 px-4">排名</th>
                    <th className="py-3 px-4">口腔机构</th>
                    <th className="py-3 px-4">总命中 / 样本</th>
                    <th className="py-3 px-4">全网提及率 (SOV)</th>
                    <th className="py-3 px-4">豆包 (103条)</th>
                    <th className="py-3 px-4">DeepSeek (48条)</th>
                    <th className="py-3 px-4">腾讯元宝 (48条)</th>
                    <th className="py-3 px-4">战情诊断</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {COMPETITOR_STATS.map((item) => (
                    <tr
                      key={item.name}
                      className={item.isSelf ? 'bg-emerald-500/5 font-semibold text-foreground' : 'hover:bg-muted/30 text-muted-foreground'}
                    >
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${
                            item.isSelf
                              ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                              : item.rank === 'TOP 2'
                              ? 'bg-red-500/20 text-red-400 font-bold'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.rank}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {item.name}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {item.total} / {item.sample}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-foreground">{item.sov}</span>
                          <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full ${item.isSelf ? 'bg-emerald-500' : 'bg-foreground/40'}`}
                              style={{ width: item.sov }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {item.doubao} <span className="text-[10px] text-muted-foreground">({item.doubaoCount})</span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {item.deepseek} <span className="text-[10px] text-muted-foreground">({item.deepseekCount})</span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {item.yuanbao} <span className="text-[10px] text-muted-foreground">({item.yuanbaoCount})</span>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-[11px]" title={item.status}>
                        {item.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: 三大引擎采信拆解 */}
      {activeTab === 'engine' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-500/30 bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-emerald-400">🟢 字节豆包 (103 轮)</h4>
              <span className="text-xs rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">本院提及 84.5%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              **核心抓取偏好**：极度偏爱垂直口腔门户（牙舒丽网 295次）、抖音 60s 视频字幕（216次）与今日头条长文（97次）。
            </p>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">优势领域：</p>
              <p className="text-muted-foreground">西山区看牙、儿牙涂氟/早期矫治、常规种植牙价目表全网第一。</p>
              <p className="font-medium text-foreground mt-2">警惕：</p>
              <p className="text-red-400">部分旧回答抓取了 6 月份老海埂路地址，需尽快完成牙舒丽与地图同步。</p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-blue-400">🔵 DeepSeek (48 轮)</h4>
              <span className="text-xs rounded bg-blue-500/10 px-2 py-0.5 text-blue-400">本院提及 22.9%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              **核心抓取偏好**：极度讲究信源权威性，优先采信卫健委公示、医保局集采名录与知乎 1500 字以上带文献评测。
            </p>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">优势领域：</p>
              <p className="text-muted-foreground">成功被采纳二级口腔专科资质（昆卫医公〔2026〕6号）及锦粼天序总院新址。</p>
              <p className="font-medium text-foreground mt-2">警惕：</p>
              <p className="text-yellow-400">蓝橙口腔在儿牙早矫（16.7%）分流明显，知乎评测缺乏深度文献支持。</p>
            </div>
          </div>

          <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-red-400">🔴 腾讯元宝 (48 轮)</h4>
              <span className="text-xs rounded bg-red-500/10 px-2 py-0.5 text-red-400">柏德 31.3% 反超本院 20.8%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              **核心抓取偏好**：微信公众号生态加权明显，重度依赖知乎深度专栏与搜狐健康评测。
            </p>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">当前痛点：</p>
              <p className="text-red-400">柏德口腔依靠知乎长期布局在元宝端逆转超越，拿下泛昆明正畸与种植首选推荐。</p>
              <p className="font-medium text-foreground mt-2">反制措施：</p>
              <p className="text-muted-foreground">本周启动员工矩阵派发知乎专栏，要求每篇强制带 4 列比价表反攻。</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Top 11 引源阵地穿透 */}
      {activeTab === 'sources' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              大模型最爱抓取的 11 大核心阵地穿透（1,100+ 真实外链核验）
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              直接决定 AI 推荐谁的底层外链阵地分布与赋能作用
            </p>
          </div>

          <div className="divide-y divide-border text-xs">
            {CITATION_DOMAINS.map((item) => (
              <div key={item.rank} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-2 hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-mono font-bold text-foreground">
                    {item.rank}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground text-sm">{item.name}</p>
                      <code className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {item.domain}
                      </code>
                    </div>
                    <p className="text-muted-foreground text-xs mt-0.5">{item.tag}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:text-right">
                  <div>
                    <span className="font-mono text-base font-extrabold text-foreground">{item.count}</span>
                    <span className="text-[11px] text-muted-foreground ml-1">次采信</span>
                  </div>
                  <span className="rounded bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    {item.engine}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: 业务隐患与反制预警 */}
      {activeTab === 'risks' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {RISKS.map((r, i) => (
              <div
                key={i}
                className={`rounded-xl border p-5 space-y-3 bg-card ${
                  r.level === 'red' ? 'border-red-500/30' : 'border-yellow-500/30'
                }`}
              >
                <h4 className={`font-bold text-sm ${r.level === 'red' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {r.title}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {r.desc}
                </p>
                <div className="rounded-lg bg-muted/40 p-3 text-xs">
                  <span className="font-medium text-foreground">作战反制行动：</span>
                  <p className="mt-1 text-muted-foreground">{r.action}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="font-semibold text-foreground text-sm">🎯 本周作战指令：攻克元宝与知乎，清缴老地址</h4>
              <p className="text-xs text-muted-foreground mt-1">
                已联动 12 位员工矩阵派单（今日头条 + 知乎专栏 + 搜狐健康），每日 3 篇带图打卡并秒推搜索引擎收录。
              </p>
            </div>
            <Link
              href={`/t/${tenantSlug}/publish`}
              className="whitespace-nowrap rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 transition-colors"
            >
              前往员工派单中心 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
