'use client';

/**
 * 根级错误边界(docs/12 P0-1)— root layout 自身崩溃时的最后防线。
 * 必须自带 <html><body>(Next 约定),样式内联(此时 CSS 可能都没加载)。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: '#0a0c10',
          color: '#e5e7eb',
          fontFamily: "-apple-system,'PingFang SC',sans-serif",
          textAlign: 'center',
          padding: 24,
        }}
      >
        <p style={{ fontSize: 40, margin: 0 }}>🛠️</p>
        <h2 style={{ fontSize: 18, margin: 0 }}>服务出了点问题</h2>
        <p style={{ fontSize: 14, color: '#9aa0ad', maxWidth: 420, lineHeight: 1.6, margin: 0 }}>
          请点击重试;若反复出现,请联系技术支持{error.digest ? `(错误编号 ${error.digest})` : ''}。
        </p>
        <button
          onClick={() => reset()}
          style={{
            background: '#10b981',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          重试
        </button>
      </body>
    </html>
  );
}
