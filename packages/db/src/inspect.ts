import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

const { data: tenants } = await admin
  .from('tenants')
  .select('id, slug, name, industry, created_at')
  .order('created_at', { ascending: false });
console.log('=== TENANTS ===');
console.log(JSON.stringify(tenants, null, 2));

const { data: memberships } = await admin
  .from('tenant_memberships')
  .select('tenant_id, user_id, role, created_at')
  .order('created_at', { ascending: false });
console.log('=== MEMBERSHIPS ===');
console.log(JSON.stringify(memberships, null, 2));

const { data: users } = await admin.auth.admin.listUsers();
console.log('=== USERS ===');
console.log(users.users.map((u) => ({ id: u.id, email: u.email })));
