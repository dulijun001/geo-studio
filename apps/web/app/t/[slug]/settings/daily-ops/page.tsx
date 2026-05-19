/**
 * V1.10 — legacy redirect to /daily-ops?tab=settings.
 */
import { redirect } from 'next/navigation';

export default async function Redirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/daily-ops?tab=settings`);
}
