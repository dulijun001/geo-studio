/**
 * BreadcrumbList JSON-LD generator.
 *
 * Decoupled from any specific entity type — pure utility. Pages decide their
 * own breadcrumb trail and call this with a list of {name, url} pairs.
 */

import { clean } from './clean';
import type { JsonLd } from './types';

export type BreadcrumbItem = {
  name: string;
  url: string;
};

export function buildBreadcrumbSchema(items: BreadcrumbItem[]): JsonLd | null {
  if (items.length === 0) return null;

  return clean({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  });
}
