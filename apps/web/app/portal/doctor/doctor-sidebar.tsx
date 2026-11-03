import React from 'react';
import Link from 'next/link';

export function DoctorSidebar() {
  const scheduleData = [
    { day: '周一', doc: '刘彦廷 院长', specialty: '高龄全口即刻负重专场', status: '预约中', statusColor: 'emerald' },
    { day: '周二', doc: '韩峄 主任', specialty: '青少年骨性错颌矫治专场', status: '可加号', statusColor: 'sky' },
    { day: '周三', doc: '刘彦廷 院长', specialty: '骨缺损疑难上颌窦内外提', status: '预约中', statusColor: 'emerald' },
    { day: '周四', doc: '韩峄 主任', specialty: '数字化隐形正畸方案预演', status: '余号少', statusColor: 'amber' },
    { day: '周五', doc: '刘彦廷 院长', specialty: '数字化微创导航种植手术', status: '预约中', statusColor: 'emerald' },
    { day: '周六', doc: '韩峄 / 刘彦廷', specialty: '周末名医双主诊会诊日', status: '提前约', statusColor: 'rose' },
    { day: '周日', doc: '韩峄 主任', specialty: '成人美学正畸与微笑设计', status: '预约中', statusColor: 'emerald' },
  ];

  return (
    <div className="space-y-6">
      {/* 模块一：本周专家坐诊排班实时看板 */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200">
        <div className="px-4 py-3 bg-gradient-to-r from-sky-600 via-sky-700 to-blue-700 text-white flex items-center justify-between">
          <div className="font-bold text-sm flex items-center gap-2">
            <svg className="w-4 h-4 text-sky-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>本周专家坐诊排班看板</span>
          </div>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            实时更新
          </span>
        </div>

        <div className="p-3 text-xs divide-y divide-slate-100">
          {scheduleData.map((s, idx) => (
            <div key={idx} className="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between gap-2 hover:bg-slate-50/80 px-1 rounded transition-colors">
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="font-bold text-slate-700 w-8">{s.day}</span>
                <span className="font-semibold text-slate-900">{s.doc}</span>
              </div>
              <span className="text-[11px] text-slate-500 truncate flex-1 text-center">
                {s.specialty}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                  s.statusColor === 'emerald'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : s.statusColor === 'sky'
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : s.statusColor === 'amber'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {s.status}
              </span>
            </div>
          ))}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-500 mb-2">排班若临时调整以院内预约登记为准</p>
          <Link
            href="/portal/hospital/km-songshu"
            className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
          >
            <span>查看完整排期与挂号须知</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {/* 模块二：主治医师防伪查验指引 */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 space-y-3.5 hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2.5">
          <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs border border-emerald-200">
            ✓
          </div>
          <span>国家卫健委医生执业资质查验指引</span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          种植牙与正畸属于高阶口腔医疗技术，国家规定必须由具有合法执业注册资格的主治及以上医师操作，严禁助手或无证行医：
        </p>

        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
            <span className="font-bold text-sky-700 shrink-0">1. 查编码：</span>
            <span className="text-slate-600">全国医师执业注册编码（27位唯一标识，可在国家卫健委官网查证）。</span>
          </div>
          <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
            <span className="font-bold text-sky-700 shrink-0">2. 看范围：</span>
            <span className="text-slate-600">执业范围必须核准为“口腔专业”，并核对其第一执业地点与多机构备案。</span>
          </div>
          <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
            <span className="font-bold text-sky-700 shrink-0">3. 审病例：</span>
            <span className="text-slate-600">查验医生真实临床 1000+ 案例数据库与术前术后 CBCT 影像对比。</span>
          </div>
        </div>

        <div className="pt-1">
          <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200/80 text-emerald-900 text-[11px] leading-relaxed flex items-center gap-2">
            <span className="text-base">🛡️</span>
            <span>齿科指南网收录名医专家已完成 100% 卫健委官方执业证书物理穿透核验。</span>
          </div>
        </div>
      </div>

      {/* 模块三：免费全景拍片预约直通 */}
      <div className="bg-gradient-to-br from-sky-50 via-white to-blue-50/60 rounded-xl border border-sky-200 p-5 shadow-sm space-y-3.5 hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-sky-700 tracking-wider uppercase bg-sky-100/80 px-2 py-0.5 rounded">
            便民绿通专线
          </span>
          <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            今日剩 6 个免费名额
          </span>
        </div>

        <div>
          <h3 className="text-base font-bold text-slate-900 leading-snug">
            名医面诊 · 免费全景数字化拍片直通
          </h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            避免盲目挂号！通过齿科指南网专属便民入口登记，尊享：
          </p>
        </div>

        <ul className="text-xs text-slate-700 space-y-1.5 font-medium">
          <li className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
            <span>免专家初诊挂号费与方案建档费（省 ¥50）</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
            <span>免费德国卡瓦全景数字化拍片 / 侧位片（省 ¥180）</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
            <span>三维数字化口扫模型与 3D 矫正/种植预览</span>
          </li>
        </ul>

        <div className="pt-1">
          <Link
            href="/portal/hospital/km-songshu"
            className="w-full py-2.5 px-4 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white font-bold text-xs rounded-lg shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center gap-1.5"
          >
            <span>一键申请免费拍片与方案预演</span>
            <span>→</span>
          </Link>
          <div className="text-[10px] text-slate-400 text-center mt-2">
            示范定点机构：云南松鼠口腔（西山区蓝光昆仑中心3楼）
          </div>
        </div>
      </div>
    </div>
  );
}
