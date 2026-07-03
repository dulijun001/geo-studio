-- 0044: raise daily_ops_settings.topic_count_auto cap 15 → 30.
--
-- Why (docs/11 P1-4, 2026-07-03): the 0-15 cap was designed for the
-- dual-platform era where variants/day = topics × platforms (15 × 2 = 30
-- already saturated the 26 dispatch slots of 13 core accounts × quota 2).
-- Platform-citation loop measurement showed zhihu is structurally
-- zero-cited on both Doubao AND DeepSeek (93 published / 0 cited; zero
-- zhihu.com URLs in either engine's citation pool), so songshu moved to
-- single-platform {toutiao_article} and reallocates that capacity into
-- topic coverage (the measured 3x lever: district-tier questions 18% vs
-- no-locality 6% citation rate). Single-platform mode needs topics up to
-- ~24/day to saturate the same dispatch slots.
--
-- Apply: psql --single-transaction (see memory reference-migration-via-psql;
-- drizzle journal frozen since 0006, D19).

ALTER TABLE daily_ops_settings
  DROP CONSTRAINT daily_ops_settings_topic_count_auto_check;

ALTER TABLE daily_ops_settings
  ADD CONSTRAINT daily_ops_settings_topic_count_auto_check
  CHECK (topic_count_auto BETWEEN 0 AND 30);
