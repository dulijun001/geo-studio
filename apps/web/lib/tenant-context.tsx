'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { ActiveTenant } from './tenant';

const TenantContext = createContext<ActiveTenant | null>(null);

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: ActiveTenant;
  children: ReactNode;
}) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}

/** Throws if used outside a `/t/[slug]/*` subtree. */
export function useTenant(): ActiveTenant {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used inside a TenantProvider (under /t/[slug])');
  }
  return ctx;
}
