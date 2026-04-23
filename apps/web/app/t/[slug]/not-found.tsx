import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-24">
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">租户不存在或你不是成员</h1>
      <p className="text-sm text-muted-foreground">
        要么这个租户不存在,要么你没被加入它的成员列表。如果你认为这是错误,联系管理员让他添加你。
      </p>
      <Link
        href="/app"
        className="inline-flex w-fit rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
      >
        回到我的租户
      </Link>
    </main>
  );
}
