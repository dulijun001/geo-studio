-- 今日可派单盘点(条件对齐 apps/web/app/t/[slug]/publish/actions.ts dispatchToday)
\timing off
\pset pager off

\echo '=== 1. 可派单变体池(未派过的) ==='
SELECT v.platform,
       count(*) AS ready_never_dispatched
FROM content_variants v
LEFT JOIN publish_tasks pt
       ON pt.variant_id = v.id AND pt.deleted_at IS NULL
WHERE v.tenant_id = (SELECT id FROM tenants WHERE slug = 'songshu')
  AND v.compliance_status IN ('auto_approved','manual_approved')
  AND v.dod_status <> 'failed'
  AND v.status NOT IN ('archived','rejected')
  AND v.deleted_at IS NULL
  AND pt.variant_id IS NULL
GROUP BY v.platform
ORDER BY 2 DESC;

\echo ''
\echo '=== 2. 明细(最多 25 条) ==='
SELECT left(v.title, 42) AS title, v.platform, v.compliance_status, v.dod_status,
       to_char(v.updated_at,'MM-DD HH24:MI') AS updated
FROM content_variants v
LEFT JOIN publish_tasks pt
       ON pt.variant_id = v.id AND pt.deleted_at IS NULL
WHERE v.tenant_id = (SELECT id FROM tenants WHERE slug = 'songshu')
  AND v.compliance_status IN ('auto_approved','manual_approved')
  AND v.dod_status <> 'failed'
  AND v.status NOT IN ('archived','rejected')
  AND v.deleted_at IS NULL
  AND pt.variant_id IS NULL
ORDER BY v.updated_at DESC
LIMIT 25;

\echo ''
\echo '=== 3. 卡住的变体(为什么不能派) ==='
SELECT v.compliance_status, v.dod_status, count(*)
FROM content_variants v
WHERE v.tenant_id = (SELECT id FROM tenants WHERE slug = 'songshu')
  AND v.deleted_at IS NULL
  AND v.status NOT IN ('archived','rejected')
  AND NOT (v.compliance_status IN ('auto_approved','manual_approved') AND v.dod_status <> 'failed')
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12;

\echo ''
\echo '=== 4. 核心发布号数量(H0 闸) ==='
SELECT count(*) FILTER (WHERE settings->'publishing'->>'is_active' = 'true') AS core_active,
       count(*) AS operators_total
FROM staff_accounts
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'songshu')
  AND status = 'active' AND kind = 'operator' AND deleted_at IS NULL;

\echo ''
\echo '=== 5. daily-ops 设置(周末跳过?) ==='
SELECT enabled, weekend_skip, topic_count_auto, platforms, max_variants_day
FROM daily_ops_settings
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'songshu');

\echo ''
\echo '=== 6. 今日 run 状态 ==='
SELECT run_date, status, created_at::time(0)
FROM daily_ops_runs
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'songshu')
ORDER BY run_date DESC LIMIT 5;

\echo ''
\echo '=== 7. migration 0046 是否已进库(D56 验证) ==='
SELECT pg_get_functiondef(oid) ~ 'ORDER BY[[:space:]]+priority DESC' AS priority_driven_0046_applied
FROM pg_proc WHERE proname = 'daily_ops_pick_topics' LIMIT 1;

\echo ''
\echo '=== 8. 选题池水位(按地域级) ==='
SELECT CASE WHEN text LIKE '%昆明%' AND text ~ '(西山|盘龙|五华|官渡|呈贡|安宁|晋宁|富民|宜良|嵩明|石林|禄劝|寻甸)' THEN 'A 区县级'
            WHEN text LIKE '%昆明%' THEN 'B 城市级'
            ELSE 'C 无地域' END AS tier,
       priority, count(*)
FROM questions
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'songshu')
  AND deleted_at IS NULL AND parent_id IS NOT NULL
GROUP BY 1,2 ORDER BY 1, 2 DESC;
