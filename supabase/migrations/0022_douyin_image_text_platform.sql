-- 0022_douyin_image_text_platform: add a graphic-text 抖音 variant alongside
--   the existing video-script one.
--
-- Background: 抖音 supports two distinct content types — short video (drives
--   douyin_script variants) and image+text posts (this new platform). The
--   original variant_platform enum only covered the video form because that
--   was V1's first-pass focus. Customer (松鼠口腔) now wants graphic-text
--   primary in early phase, so we add the second variant cleanly.
--
-- D7/D10: every DB change goes through migration. PG enum ADD VALUE must
-- run outside a transaction, hence the COMMIT/BEGIN split below — Supabase
-- migrate runs each file as a single transaction by default but PG accepts
-- ADD VALUE pre-committed safely.

ALTER TYPE variant_platform ADD VALUE IF NOT EXISTS 'douyin_image_text';
