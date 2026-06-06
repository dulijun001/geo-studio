'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * DemoModal — 落地页"预约演示"统一弹窗(2026-06-06)。
 *
 * 替换原 #cta 锚点滚动 + mailto:。任何带 `data-demo-trigger` 的元素被点击
 * 都会打开此弹窗,展示二维码 + 引导加微信预约演示。
 *
 * 为什么用全局 data-attribute 委托:落地页 page.tsx 是 server component,
 * 4 处 CTA 散在各 section。挂一个 client 组件监听全局点击,比把整页改成
 * client 或给每个按钮单独传 handler 干净得多。
 */

const PALETTE = {
  bg: '#09090b',
  panel: '#18181b',
  border: '#27272a',
  fg: '#fafafa',
  fgMuted: '#a1a1aa',
  accent: '#34d399',
  ink: '#0a0a0a',
};

// 二维码图片路径。换成你的真实二维码:把图片放 apps/web/public/demo-qr.png 即可。
const QR_SRC = '/demo-qr.png';

export function DemoModal() {
  const [open, setOpen] = useState(false);
  const [qrOk, setQrOk] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest('[data-demo-trigger]');
      if (target) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(4px)',
        padding: 20,
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: '100%',
          maxWidth: 380,
          borderRadius: 16,
          border: `1px solid ${PALETTE.border}`,
          background: PALETTE.panel,
          padding: 32,
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="关闭"
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            background: 'transparent',
            border: 'none',
            color: PALETTE.fgMuted,
            fontSize: 22,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <h3 style={{ color: PALETTE.fg, fontSize: 19, fontWeight: 700, margin: 0 }}>
          预约一次 30 分钟演示
        </h3>
        <p style={{ color: PALETTE.fgMuted, fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>
          扫码加我，我们用你公司的真实问题，
          <br />
          现场跑一遍 AI 引擎到底有没有引用你。
        </p>

        <div
          style={{
            margin: '22px auto 0',
            width: 200,
            height: 200,
            borderRadius: 12,
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {qrOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={QR_SRC}
              alt="预约演示二维码"
              width={200}
              height={200}
              style={{ objectFit: 'contain' }}
              onError={() => setQrOk(false)}
            />
          ) : (
            <span style={{ color: '#71717a', fontSize: 12, padding: 16, lineHeight: 1.6 }}>
              二维码待上传
              <br />
              (apps/web/public/demo-qr.png)
            </span>
          )}
        </div>

        <p style={{ color: PALETTE.accent, fontSize: 13, fontWeight: 600, marginTop: 18 }}>
          微信扫一扫 · 备注「GEO 演示」
        </p>
      </div>
    </div>
  );
}
