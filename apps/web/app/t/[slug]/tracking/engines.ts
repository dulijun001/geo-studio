/**
 * Engine constants — kept in a non-`'use server'` module on purpose.
 *
 * Next.js 14 server-action files (`'use server'`) replace every export with a
 * server reference proxy on the client side. Importing a plain const from such
 * a file gives the client a proxy object, not the value — so `.map()`,
 * `.includes()`, etc. throw `TypeError: o.map is not a function` at hydration
 * and trip the global error boundary. Constants and types must live outside
 * the server-action file.
 */

export const SUPPORTED_ENGINES = ['doubao', 'yuanbao'] as const;
export type SupportedEngine = (typeof SUPPORTED_ENGINES)[number];
