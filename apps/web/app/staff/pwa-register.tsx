'use client';

import { useEffect, useState } from 'react';

/**
 * Registers the staff service worker on first paint and shows an "已离线"
 * indicator when the browser is offline. Tiny and disposable — if we ever
 * need richer offline UX (queue posts, replay) we'll graduate to Workbox.
 */
export function PwaRegister() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/staff-sw.js', { scope: '/staff' })
        .catch(() => undefined);
    }
    setOnline(navigator.onLine);
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener('online', onOn);
    window.addEventListener('offline', onOff);
    return () => {
      window.removeEventListener('online', onOn);
      window.removeEventListener('offline', onOff);
    };
  }, []);

  if (online !== false) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 text-center text-xs font-medium text-white">
      已离线 · 显示的是最近一次缓存的任务
    </div>
  );
}
