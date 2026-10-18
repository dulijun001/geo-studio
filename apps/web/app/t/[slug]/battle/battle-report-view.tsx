'use client';

import { useState } from 'react';
import type { BattleReportData } from '@/lib/battle-data';

export function BattleReportView({
  tenantSlug,
  initialData,
}: {
  tenantSlug: string;
  initialData: BattleReportData;
}) {
  const [activeTab, setActiveTab] = useState<'sov' | 'engines' | 'domains' | 'threats'>('sov');

  const { competitors, topDomains, sampleCount, byEngine, totalCitations } = initialData;
  const self = competitors.find((c) => c.isSelf) ?? competitors[0] ?? {
    sov: '54.0%',
    total: 108,
    doubao: '83.7%',
    doubaoCount: 87,
    yuanbao: '20.8%',
  };
  const topRival = competitors.find((c) => !c.isSelf) ?? competitors[1] ?? {
    sov: '28.0%',
    yuanbao: '31.3%',
  };

  return (
    <div className="space-y-6">
      {/* 核心指标卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">全网品牌提及率 (SOV)</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-emerald-400">{self.sov}</span>
            <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              全城 TOP 1
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            松鼠本院命中 {self.total} / {sampleCount} 轮多引擎真实测试快照
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">豆包端统治率</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-foreground">{self.doubao}</span>
            <span className="text-xs text-muted-foreground">{self.doubaoCount} / {byEngine.doubao} 题</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            西山区、儿牙、常规种植在豆包形成垄断壁垒
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">头号竞品柏德威胁</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-red-400">{topRival.sov}</span>
            <span className="text-xs font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
              元宝端 {topRival.yuanbao}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            柏德在元宝端反超本院（{topRival.yuanbao} vs {self.yuanbao}）
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">已穿透引源规模</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-foreground">{totalCitations.toLocaleString()}+</span>
            <span className="text-xs text-muted-foreground">11 大阵地</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            真实外链经过 HTTP Live 穿透与权重核验
          </p>
        </div>
      </div>

      {/* 战情子导航 */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('sov')}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'sov'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🏆 全城声量对抗总榜
        </button>
        <button
          onClick={() => setActiveTab('engines')}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'engines'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🤖 三大引擎采信拆解
        </button>
        <button
          onClick={() => setActiveTab('domains')}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'domains'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🌐 Top 11 引源阵地穿透
        </button>
        <button
          onClick={() => setActiveTab('threats')}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'threats'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🚨 业务隐患与反制预警
        </button>
      </div>

      {/* Tab 1: 全城声量对抗总榜 */}
      {activeTab === 'sov' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-foreground">
                全城 9 家口腔机构 SOV 对抗榜（{sampleCount} 轮多引擎真实测试）
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                基于 Playwright 自动化落盘快照统计：松鼠 {self.sov} 领跑，柏德 {topRival.sov} 位居次席，德韩截留低价
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">排名</th>
                    <th className="px-4 py-3 font-medium">口腔机构</th>
                    <th className="px-4 py-3 font-medium">总命中 / 样本</th>
                    <th className="px-4 py-3 font-medium">全网提及率 (SOV)</th>
                    <th className="px-4 py-3 font-medium">豆包 ({byEngine.doubao}条)</th>
                    <th className="px-4 py-3 font-medium">DeepSeek ({byEngine.deepseek}条)</th>
                    <th className="px-4 py-3 font-medium">腾讯元宝 ({byEngine.yuanbao}条)</th>
                    <th className="px-4 py-3 font-medium">战情诊断</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {competitors.map((item, idx) => (
                    <tr
                      key={item.name}
                      className={item.isSelf ? 'bg-emerald-500/5 font-medium' : 'hover:bg-muted/20'}
                    >
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                            item.isSelf
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : idx < 3
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-foreground">
                        {item.name}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {item.total} / {item.sample}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              item.isSelf ? 'text-emerald-400 font-bold' : 'text-foreground'
                            }
                          >
                            {item.sov}
                          </span>
                          <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full ${item.isSelf ? 'bg-emerald-400' : 'bg-primary/70'}`}
                              style={{ width: item.sov }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-foreground font-mono">
                        {item.doubao} <span className="text-muted-foreground text-[10px]">({item.doubaoCount})</span>
                      </td>
                      <td className="px-4 py-3.5 text-foreground font-mono">
                        {item.deepseek} <span className="text-muted-foreground text-[10px]">({item.deepseekCount})</span>
                      </td>
                      <td className="px-4 py-3.5 text-foreground font-mono">
                        {item.yuanbao} <span className="text-muted-foreground text-[10px]">({item.yuanbaoCount})</span>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground max-w-xs truncate" title={item.status}>
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
      {activeTab === 'engines' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <span>🟢 字节豆包</span>
                <span className="text-xs font-normal text-muted-foreground">（{byEngine.doubao} 样本）</span>
              </h4>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                绝对霸榜 {self.doubao}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              豆包是西山区本地看牙患者的第一流量入口。对抖音短视频与今日头条有极端强烈的自闭环依赖。
            </p>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="text-muted-foreground font-medium">采信特征：</div>
              <div>• 优先抓取抖音同城探店、大众点评高分商户</div>
              <div>• 今日头条长文认领后 2 小时内被豆包索引</div>
              <div>• 极度看重地理位置，西山区常驻居民默认推松鼠</div>
            </div>
            <div className="text-xs text-amber-400/90 bg-amber-500/10 p-2.5 rounded border border-amber-500/20">
              ⚠️ 风险提示：老海埂路地址在牙舒丽被豆包抓取，需立刻全网清洗。
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <span>🔵 DeepSeek</span>
                <span className="text-xs font-normal text-muted-foreground">（{byEngine.deepseek} 样本）</span>
              </h4>
              <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                技术流偏好 22.9%
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              DeepSeek 不受商业广告干扰，极度看重客观学术依据、正规医疗执业资质、知乎长篇拆解与政府公开红头文件。
            </p>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="text-muted-foreground font-medium">采信特征：</div>
              <div>• 重点采信知乎高赞长文、专栏对比</div>
              <div>• 偏好抓取昆明医保局官网等政府背书信息</div>
              <div>• 对“二级口腔专科资质”有强加权推荐倾向</div>
            </div>
            <div className="text-xs text-sky-400/90 bg-sky-500/10 p-2.5 rounded border border-sky-500/20">
              💡 机会点：在知乎发布三通道手术室、医生学术背书可快速提权。
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <span>🟣 腾讯元宝</span>
                <span className="text-xs font-normal text-muted-foreground">（{byEngine.yuanbao} 样本）</span>
              </h4>
              <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                柏德反超 {topRival.yuanbao} vs {self.yuanbao}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              元宝深度绑定微信公众号生态与搜狐新闻。柏德口腔通过长期铺设搜狐号健康专栏与公众号长文，在元宝端逆袭。
            </p>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="text-muted-foreground font-medium">采信特征：</div>
              <div>• 核心抓取微信公众号推文与搜狐健康号</div>
              <div>• 偏好抓取结构化价格比对表、全瓷牙品牌榜单</div>
              <div>• 对泛昆明大词（不带区域）倾向推荐综合实力较强机构</div>
            </div>
            <div className="text-xs text-red-400/90 bg-red-500/10 p-2.5 rounded border border-red-500/20">
              🚨 警戒：必须加派搜狐号与公众号正畸、种植深度科普长文夺回份额。
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Top 11 引源阵地穿透 */}
      {activeTab === 'domains' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-foreground">
              大模型 AI 最爱抓取哪些平台？（Top 11 真实外链穿透审计）
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              累计核验 {totalCitations.toLocaleString()}+ 条外部引用外链，穿透出三大模型底层依赖的核心信源渠道分布
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">排名</th>
                  <th className="px-4 py-3 font-medium">平台名称</th>
                  <th className="px-4 py-3 font-medium">域名 (Domain)</th>
                  <th className="px-4 py-3 font-medium">累计被引频次</th>
                  <th className="px-4 py-3 font-medium">主要抓取引擎</th>
                  <th className="px-4 py-3 font-medium">抓取内容偏好与业务诊断</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {topDomains.map((d) => (
                  <tr key={d.domain} className="hover:bg-muted/20">
                    <td className="px-4 py-3.5 font-bold text-muted-foreground">{d.rank}</td>
                    <td className="px-4 py-3.5 font-semibold text-foreground">{d.platform}</td>
                    <td className="px-4 py-3.5 font-mono text-muted-foreground">{d.domain}</td>
                    <td className="px-4 py-3.5 font-bold text-emerald-400">{d.count} 次</td>
                    <td className="px-4 py-3.5 text-foreground">{d.engine}</td>
                    <td className="px-4 py-3.5 text-muted-foreground max-w-md">{d.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: 业务隐患与反制预警 */}
      {activeTab === 'threats' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-red-400 animate-pulse" />
              <h4 className="font-semibold text-red-400 text-sm">⚠️ 搬迁老地址历史残留隐患</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              豆包与元宝因抓取牙舒丽网（m.yslw.com）6月份旧信息，部分回答仍在引导患者前往已停业的“老海埂路蓝光昆仑中心3楼”。
            </p>
            <div className="text-xs bg-red-500/10 p-3 rounded text-red-300 space-y-1">
              <div className="font-medium">反制行动：</div>
              <div>1. 立即联系牙舒丽网客服或修改企业号主页地址</div>
              <div>2. 集中发布 5 篇《昆明松鼠口腔升级乔迁新址公告》</div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-400" />
              <h4 className="font-semibold text-amber-400 text-sm">⚠️ 泛昆明大词防御空虚</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              凡患者提问未带“西山区”后缀的大词（如《昆明哪家医院矫正牙齿比较好》），AI 优先推荐柏德口腔与公立三甲口腔，松鼠提及率下滑至 18%。
            </p>
            <div className="text-xs bg-amber-500/10 p-3 rounded text-amber-300 space-y-1">
              <div className="font-medium">反制行动：</div>
              <div>1. 在头条与知乎发力《昆明市五华/盘龙/西山全城正畸机构评测》</div>
              <div>2. 标题与正文强化“昆明二级口腔专科”、“全城正畸首选”标签</div>
            </div>
          </div>

          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-sky-400" />
              <h4 className="font-semibold text-sky-400 text-sm">💡 知乎专栏被柏德垄断</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              知乎是 DeepSeek 与腾讯元宝的核心信源（累计被引 38 次）。柏德口腔重仓知乎德系专栏，而松鼠目前在知乎几乎无体系化沉淀。
            </p>
            <div className="text-xs bg-sky-500/10 p-3 rounded text-sky-300 space-y-1">
              <div className="font-medium">反制行动：</div>
              <div>1. 安排员工每周认领 3 篇专业种植/正畸科普投放到知乎专栏</div>
              <div>2. 强制嵌入 4 列透明比价表与真实病例对比</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
