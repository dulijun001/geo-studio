export default function StaffHomePage() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">今日任务</h1>
        <p className="text-sm text-muted-foreground">
          员工端占位 — W5 完整上线后,这里会显示分派给你的当日内容卡片、
          文案一键复制、跳转头条 / 抖音 App、打卡回执。
        </p>
      </section>

      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <article key={i} className="rounded-md border border-border bg-background p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                头条号文章
              </span>
              <span className="text-xs text-muted-foreground">占位 #{i}</span>
            </div>
            <h2 className="mb-1 font-medium">示例标题 · 种植牙术后的护理要点</h2>
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
              正文摘要在这里显示 · 真实上线后会是 GEO 优化过的多平台文案变体…
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled
                className="flex-1 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white opacity-50"
              >
                复制文案
              </button>
              <button
                type="button"
                disabled
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium opacity-50"
              >
                我已发布
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-md border border-dashed border-border bg-background p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">W5 待接入</p>
        <ul className="list-inside list-disc space-y-1">
          <li>手机号 + SMS 验证码登录(阿里云短信,需提前申请签名)</li>
          <li>员工账号与 staff_accounts 表绑定</li>
          <li>打卡回执 → publish_tasks.published_url</li>
          <li>跳转头条 App 的 URL scheme(iOS/Android 兼容)</li>
        </ul>
      </div>
    </div>
  );
}
