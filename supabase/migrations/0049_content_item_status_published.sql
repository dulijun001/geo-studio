-- Migration 0049: Add 'published' to content_item_status enum and backfill published items
-- Fixes D14/D17 wiring where staff markTaskPublished transitions content_items.status -> 'published'

ALTER TYPE public.content_item_status ADD VALUE IF NOT EXISTS 'published';

UPDATE public.content_items ci
SET status = 'published', updated_at = now()
FROM public.content_variants cv
JOIN public.publish_tasks pt ON pt.variant_id = cv.id
WHERE cv.content_item_id = ci.id
  AND pt.status = 'published'
  AND ci.status <> 'published';
