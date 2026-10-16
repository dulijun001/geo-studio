import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getRequestOrigin } from '@/lib/url';

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  const origin = getRequestOrigin(request);
  const url = new URL('/login', origin);
  return NextResponse.redirect(url, { status: 303 });
}

// Allow GET too so a plain <a> link works in dev. In production we'd restrict to POST.
export async function GET(request: Request) {
  return POST(request);
}
