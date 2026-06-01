'use client';

import { type ReactNode, useState } from 'react';

/**
 * 后台外壳:桌面端 = 固定左侧栏(原样);移动端 = 侧栏收进抽屉,
 * 顶部汉堡唤出 + 遮罩,正文全宽。解决手机上 w-60 死宽侧栏吃掉半屏的问题。
 *
 * 服务端 layout 把已渲染好的侧栏内容(logo/租户卡/导航/底部链接)作为
 * `sidebar` 传进来;本组件只负责响应式定位 + 抽屉开合状态。
 */
export function AdminShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen bg-background">
      {/* 移动端顶栏(< lg 显示) */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="打开菜单"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-white/5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-foreground">GEO Studio</span>
      </div>

      {/* 抽屉遮罩 */}
      {open && (
        <button
          type="button"
          aria-label="关闭菜单"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/55 lg:hidden"
        />
      )}

      {/* 侧栏:移动端抽屉(fixed + 平移),桌面端静态固定 */}
      <aside
        // 点到导航链接 / 退出按钮就自动收起抽屉(事件委托)
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a, button[type="submit"]')) {
            setOpen(false);
          }
        }}
        className={`fixed inset-y-0 left-0 z-50 flex w-[80%] max-w-[300px] transform flex-col border-r border-border bg-background/95 backdrop-blur-md transition-transform duration-300 lg:sticky lg:top-0 lg:z-10 lg:h-screen lg:w-60 lg:max-w-none lg:translate-x-0 lg:bg-background/80 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebar}
      </aside>

      {/* 正文:移动端全宽 + 顶栏留白,桌面端原样 */}
      <main className="relative z-10 min-w-0 flex-1 overflow-x-hidden pt-14 lg:pt-0">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8 xl:px-12">
          {children}
        </div>
      </main>
    </div>
  );
}
