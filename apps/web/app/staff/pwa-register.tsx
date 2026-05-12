'use client';

import { useEffect, useState } from 'react';

/**
 * Was a Service Worker registrar. Now does the inverse: actively unregisters
 * any leftover `/staff-sw.js` worker and purges its caches on staff devices
 * that had the old PWA installed.
 *
 * Reason: the previous stale-while-revalidate SW could serve yesterday's task
 * list before the network refresh landed — risky in a compliance + dispatch
 * workflow. We deleted the SW + manifest server-side, but installed workers
 * persist on devices until something tells them to go away. This component
 * does that, once, transparently. Safe to remove after every staff device
 * has loaded the page once post-deploy.
 *
 * The offline indicator (navigator.onLine) is kept — it's pure browser API,
 * no SW dependency.
 */
export function PwaRegister() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => undefined);
    }
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith('geo-staff-')).map((k) => caches.delete(k))))
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
      已离线 · 请检查网络
    </div>
  );
}
