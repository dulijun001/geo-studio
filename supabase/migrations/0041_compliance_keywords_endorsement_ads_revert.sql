-- Revert 0041 — 删除 P0-5 新增的医生背书 + 变相广告关键词规则

DELETE FROM compliance_keywords
WHERE tenant_id IS NULL
  AND deleted_at IS NULL
  AND term IN (
    '带来福音',
    '接诊过',
    '年种植经验',
    '年临床经验',
    '主刀完成',
    '提供专业的',
    '提供种植牙服务',
    '口腔解决方案'
  )
  AND category IN ('hidden-ad','endorsement-doctor');
