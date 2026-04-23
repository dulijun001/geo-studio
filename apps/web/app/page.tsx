export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-24">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          GEO Studio · v0.1
        </p>
        <h1 className="text-4xl font-semibold leading-tight">
          让 AI 在回答客户问题时引用你。
        </h1>
        <p className="text-lg text-muted-foreground">
          多租户生成式引擎优化平台 —— 内容调度 · 发布助手 · 追踪 · 归因。
        </p>
      </div>
      <div className="flex gap-3">
        <a
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
          href="/app"
        >
          进入后台(占位)
        </a>
        <a
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          href="/staff"
        >
          员工端(占位)
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        骨架已就位 · 详见 <code className="rounded bg-muted px-1">CLAUDE.md</code> 与{' '}
        <code className="rounded bg-muted px-1">docs/</code>
      </p>
    </main>
  );
}
