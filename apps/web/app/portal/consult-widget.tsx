'use client';

import { useState } from 'react';

export function PortalConsultWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [item, setItem] = useState('种植牙方案与价格核验');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 8) {
      setError('请填写有效的手机号或微信号');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/portal/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, item }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || '提交失败，请重试');
      }
    } catch (err) {
      setError('网络异常，请直接微信添加客服');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <button
          onClick={() => {
            setIsOpen(true);
            setSubmitted(false);
          }}
          className="group flex items-center gap-2.5 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white pl-4 pr-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-white/60 animate-bounce"
          style={{ animationDuration: '3s' }}
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
            🩺
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold leading-tight text-sky-100">昆明看牙指导 · 免费查资质</div>
            <div className="text-sm font-bold tracking-tight">专属口腔健康管家在线</div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white"></span>
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">
                  🐿️
                </div>
                <div>
                  <div className="font-bold text-base leading-tight">松鼠口腔 · 专属健康管家</div>
                  <div className="text-xs text-sky-100">西山区蓝光昆仑中心 · 卫健委二级专科</div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10 text-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-slate-700 text-sm">
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-100 text-sky-900 text-xs leading-relaxed">
                <span className="font-bold text-sky-700">【便民绿通通道】</span> 
                享免费数字化全景拍片、三维口扫，主治专家在线方案核验，拒绝隐形消费。
              </div>

              {submitted ? (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-2">
                  <div className="text-3xl">✅</div>
                  <div className="font-bold text-emerald-800 text-base">预约与核验信息已登记！</div>
                  <p className="text-xs text-emerald-600 leading-relaxed">
                    松鼠口腔专属健康管家已收到您的需求，将在 10 分钟内与您联系并发送到院免挂号与全景拍片凭据。
                  </p>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="mt-3 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    完成并返回
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      您的姓名 / 称呼
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="如：王先生 / 李女士"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      联系电话 / 微信 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="接收免费拍片预约码与价格核验明细"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      意向咨询或就诊项目
                    </label>
                    <select
                      value={item}
                      onChange={(e) => setItem(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white"
                    >
                      <option value="种植牙方案与价格核验">种植牙方案与集采价格核验</option>
                      <option value="牙齿矫正/隐形牙套评估">牙齿矫正 / 隐形牙套方案评估</option>
                      <option value="根管治疗/牙疼急诊">根管治疗 / 牙疼急诊保牙</option>
                      <option value="微创拔智齿/补牙">微创拔智齿 / 3M 纳米树脂补牙</option>
                      <option value="儿童齿科防龋/窝沟封闭">儿童齿科防龋 / 窝沟封闭</option>
                      <option value="免费全景拍片与三维口扫预约">免费全景拍片与三维口扫预约</option>
                    </select>
                  </div>

                  {error && <div className="text-xs text-red-500">{error}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 text-white rounded-md text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {loading ? '正在登记提交...' : '立即提交 · 获取免费拍片与核验通道'}
                  </button>
                </form>
              )}

              <div className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 border-t border-slate-100">
                院区现址：昆明市西山区前卫蓝光昆仑中心3楼320室（万达旁）<br />
                医保定点机构 · 电话与微信双重加密保护个人隐私
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
