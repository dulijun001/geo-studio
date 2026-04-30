import Link from 'next/link';

/**
 * Staff-side user guide. Public — no login required, so a fresh employee
 * can read it before they log in for the first time. Mobile-first layout
 * (everything fits in max-w-md per the staff shell).
 */
export const metadata = {
  title: '使用手册 · GEO Studio 员工端',
};

export default function StaffHelpPage() {
  return (
    <article className="space-y-8 pb-24">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">使用手册</h1>
        <p className="text-sm text-muted-foreground">
          5 分钟读完。看完就会用,不会有别的事。
        </p>
      </header>

      <Step n="1" title="第一次登录(只做一次)">
        <p>管理员会用微信发给你两样东西之一:</p>
        <Sub label="A. 一次性链接(推荐)">
          <p>微信里点开链接 → 网页打开 → 输你想用的密码(任意 8 位以上),保存。以后用<strong>手机号 + 这个密码</strong>登录。链接 24 小时内有效,过期再找管理员要。</p>
        </Sub>
        <Sub label="B. 6 位访问码">
          <p>
            打开 <Code>/staff/login</Code> 页 → 填你的手机号 + 这 6 位数字 → 登录。访问码用一次就失效。
          </p>
        </Sub>
        <Tip>
          登录后<strong>不要退出</strong>。系统会保留你 7 天的登录状态,这 7 天里直接打开就能看任务,不用再输密码。
        </Tip>
      </Step>

      <Step n="2" title="看今天的任务">
        <p>登录后首页就是任务列表,卡片从上往下显示:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>顶部时间 — 这条任务<strong>哪天前必须发完</strong></li>
          <li>平台 — 抖音 / 头条 / 小红书 / 知乎,只发派给你这平台的</li>
          <li>暗号 — 一组 6 位字符(例如 <Code>K3M9X1</Code>),后面要用</li>
          <li>正文 — 这次要发的内容(已经按平台排版好,直接复制)</li>
        </ul>
        <Tip>
          任务上方红字提示「<strong>逾期</strong>」就是过了截止时间还没发,会扣考核。
          看不出哪条最急?<strong>从上往下做就行</strong>,系统已经按截止时间排好了。
        </Tip>
      </Step>

      <Step n="3" title="复制内容到平台发布">
        <p>每个任务卡里都有一个<strong>蓝色「复制文案」按钮</strong>。流程:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>点蓝色「复制文案」按钮 → 屏幕底部冒出「已复制」</li>
          <li>退出小程序 → 打开抖音 / 头条 / 小红书 App</li>
          <li>新建一篇 → 标题输入框长按 → 「粘贴」</li>
          <li>正文里继续粘贴 → 按平台习惯加图片 / 表情 / 标签</li>
          <li>发布 → 复制刚发布的<strong>那条内容的链接</strong>(下一步用)</li>
        </ol>
        <Trouble title="点了复制按钮没反应?">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>第一种:微信内置浏览器拦截了 → 把页面用<strong>右上角三个点 → 在浏览器中打开</strong></li>
            <li>第二种:iOS Safari 隐私模式 → 切换到普通模式</li>
            <li>第三种:都不行就<strong>长按文字</strong>,弹出菜单选「拷贝」/ 「全选」 → 「拷贝」</li>
          </ul>
        </Trouble>
        <Tip>
          每条内容里都已经自带<strong>暗号</strong>(一般在文末),不要删!患者来店报这个暗号,系统才知道是你发的内容带来的。
        </Tip>
      </Step>

      <Step n="4" title="贴回发布链接(关键!)">
        <p>
          发完抖音 / 头条 → 把<strong>那条帖子的链接</strong>复制 → 回到 GEO 员工端 → 在该任务卡找到「<strong>已发布</strong>」按钮 → 点它 → 弹出输入框,粘贴链接 → 「确定」。
        </p>
        <p className="text-xs text-muted-foreground">
          为什么这步重要:这是系统知道你完成了的唯一方式 + 后续追踪到店转化要靠这个链接。
        </p>
        <Trouble title="粘贴框报错「请粘贴完整链接」">
          链接必须以 <Code>http://</Code> 或 <Code>https://</Code> 开头。从抖音 App 复制时确认拷贝的是
          <strong>「分享 → 复制链接」</strong>那种,不是直接复制标题。
        </Trouble>
        <Trouble title="发完了忘记保留链接">
          打开你的抖音 / 头条主页 → 找到刚发的那条 → 点分享 → 「复制链接」,补回来。
        </Trouble>
      </Step>

      <Step n="5" title="发不了 / 不想发?选「跳过」">
        <p>
          有合理原因(账号被限流、内容不熟、平台审核没过)发不了的,在该卡片点「<strong>跳过</strong>」按钮 → 写一句原因 → 提交。
        </p>
        <Tip>
          跳过<strong>不会</strong>扣考核,只要写明真原因。但<strong>别养成习惯</strong>,长期跳过率高管理员会找你聊。
        </Tip>
      </Step>

      <Step n="6" title="想看自己历史?">
        <p>
          首页底部有<strong>「我的历史」</strong>区,显示你过去 7 天发了多少条、跳过了多少、最早发的几条带来了多少咨询(等系统跑一周才有数据)。
        </p>
      </Step>

      <Step n="7" title="忘密码 / 手机号换了 / 登不进去">
        <p>
          找管理员重发一次性链接(参考第 1 步)即可。无法自助重置 — 因为这是医疗合规要求,身份校验必须人工。
        </p>
      </Step>

      <hr className="border-border" />

      <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs">
        <p className="font-semibold text-amber-900">三件事一定要记得</p>
        <ul className="list-disc space-y-1 pl-5 text-amber-800">
          <li>暗号<strong>不要删</strong> — 删了等于白发,后续追踪不到</li>
          <li>发布完<strong>必须粘回链接</strong> — 不粘 = 系统认为你没发,会逾期扣考核</li>
          <li>不要把账号<strong>给别人用</strong> — 出问题责任在你(医疗广告法)</li>
        </ul>
      </section>

      <section className="space-y-3 text-xs text-muted-foreground">
        <p>有问题问管理员。或者:</p>
        <Link href="/staff" className="block underline-offset-2 hover:underline">
          ← 返回任务列表
        </Link>
      </section>
    </article>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-baseline gap-2 text-base font-semibold">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          {n}
        </span>
        <span>{title}</span>
      </h2>
      <div className="space-y-3 pl-8 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border-l-2 border-blue-400 bg-blue-50 px-3 py-2 text-xs text-blue-900">
      <span className="font-medium">提示</span> · {children}
    </div>
  );
}

function Trouble({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border border-border bg-background px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium">遇到问题 · {title}</summary>
      <div className="mt-2 space-y-1">{children}</div>
    </details>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
  );
}
