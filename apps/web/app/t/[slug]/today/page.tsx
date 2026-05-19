/**
 * V1.10 — legacy redirect.
 * /today moved into /daily-ops Hub as the default "today" tab (2026-05-19).
 * Old URL kept alive so emails / bookmarks don't break.
 */
import { redirect } from 'next/navigation';

export default async function Redirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/daily-ops`);
}
