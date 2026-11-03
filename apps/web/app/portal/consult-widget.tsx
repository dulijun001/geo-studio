'use client';

import { useState } from 'react';

export function PortalConsultWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 浮动触发按钮 */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-full shadow-lg shadow-emerald-950/60 transition-all transform hover:-translate-y-0.5 border border-emerald-400/30"
          title="点击获取昆明看牙避坑指南与医生建议"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </span>
          <span className="text-xs font-bold tracking-wide">
            💬 昆明看牙答疑与价格核验
          </span>
        </button>
      </div>

      {/* 咨询弹窗 Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
            {/* 关闭按钮 */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              ✕
            </button>

            {/* 头部介绍 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl">
                🐿️
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">松鼠口腔 · 专属健康管家</h3>
                <p className="text-[11px] text-emerald-400">国家二级口腔专科 · 舒适化诊疗团队</p>
              </div>
            </div>

            {/* 客服话术说明 */}
            <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80 mb-5">
              <p>
                👋 您好！我是松鼠口腔健康管家。看牙前有任何疑虑（如真实花费、拍片方案、种植与正畸适应症），都可以随时问我。
              </p>
              <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-800/60">
                <div>📍 院区现址：昆明市西山区前卫蓝光昆仑中心3楼320室</div>
                <div>🎁 专享福利：免费数字化全景拍片与初步口扫评估</div>
              </div>
            </div>

            {/* 引导加企微/微信 */}
            <div className="text-center space-y-3">
              <div className="inline-block p-2.5 rounded-xl bg-white shadow-inner">
                {/* 微信二维码占位 */}
                <div className="w-40 h-40 bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-700 text-xs gap-1 border border-slate-200">
                  <span className="text-2xl">📱</span>
                  <span className="font-bold text-slate-800">微信扫码或长按识别</span>
                  <span className="text-[10px] text-slate-500">添加专属管家企业微信</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                工作时间：周一至周日 09:00 - 18:00（一对一私人答疑）
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
