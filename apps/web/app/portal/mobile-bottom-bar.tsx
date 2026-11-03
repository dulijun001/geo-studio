'use client';

import React, { useState } from 'react';

export default function MobileBottomBar() {
  const [showModal, setShowModal] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 8) {
      alert('请填写正确的手机号码');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || '移动端快捷留资',
          phone,
          item: '移动端底栏快捷咨询/挂号',
          remark: '来自手机端吸底快速通道',
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(() => {
          setShowModal(false);
          setSubmitted(false);
          setPhone('');
          setName('');
        }, 2000);
      } else {
        alert('提交失败，请稍后重试');
      }
    } catch {
      alert('网络繁忙，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* 手机端专用吸底固定栏 - 仅在移动端 sm 以下展示 */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-4 py-2 flex items-center justify-between gap-3">
        <a
          href="tel:0871-68888888"
          className="flex flex-col items-center justify-center text-slate-600 hover:text-sky-600 transition-colors py-1 px-2 flex-shrink-0"
        >
          <svg className="w-5 h-5 text-sky-600 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="text-[10px] font-medium">电话直连</span>
        </a>

        <button
          onClick={() => setShowModal(true)}
          className="flex-1 bg-gradient-to-r from-sky-600 to-sky-700 active:from-sky-700 active:to-sky-800 text-white rounded-lg py-2.5 px-3 flex items-center justify-center gap-1.5 shadow-sm text-xs font-semibold"
        >
          <svg className="w-4 h-4 text-sky-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>免费查资质 · 预约拍片排班</span>
        </button>
      </div>

      {/* 留资/查验弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <h3 className="text-base font-bold text-slate-900">昆明看牙专属健康管家</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1 leading-none"
              >
                &times;
              </button>
            </div>

            {submitted ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">✓</div>
                <p className="text-sm font-bold text-slate-800">预约与查验申请已受理</p>
                <p className="text-xs text-slate-500">专属口腔顾问将在10分钟内为您致电核对资质与方案！</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="p-3 bg-sky-50/70 rounded-lg border border-sky-100 text-xs text-sky-800">
                  🎁 <strong>今日便民权益：</strong>预约立享德国卡瓦全景数字化拍片 + 三维口扫建档（免专家挂号费）。
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">您的姓名/称呼</label>
                  <input
                    type="text"
                    placeholder="如：王女士 / 李先生"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    手机号码 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="请输入联系电话（用于接收排期提醒）"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-lg py-2.5 text-xs font-bold shadow-md transition-colors"
                >
                  {submitting ? '提交中...' : '立即免费确认排班与优惠资质'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">严格保护个人隐私 · 仅用于正规医疗机构排班核对</p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
