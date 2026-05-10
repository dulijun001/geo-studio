#!/usr/bin/env python3
"""
批量调 /api/internal/rewrite-citations 清扫所有 suspected_hallucination 变体。

用法:
  python3 packages/db/src/_dev/bulk-rewrite-citations.py demo-dental
  python3 packages/db/src/_dev/bulk-rewrite-citations.py demo-dental --yes  # 跳过确认

工作流:
  1. 查询 tenant 下所有 status in (draft, reviewed) 且 citation_check.verdict =
     'suspected_hallucination' 的变体
  2. 对每个变体调内部 API → LLM 改写 → 重置 compliance pending → 入审查队列
  3. 串行执行(LLM 60s/篇,30 篇约 30 分钟)
"""
import json
import os
import sys
import time
from pathlib import Path
import urllib.request


def read_env():
    repo_root = Path(__file__).resolve().parents[4]
    for f in (repo_root / ".env.local", repo_root / ".env"):
        if not f.exists():
            continue
        for line in f.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def supa(method, path, body=None):
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    url = f"{base}/rest/v1{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else None


def call_rewrite(tenant_id, variant_id):
    base = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3001")
    secret = os.environ["DRAFT_INTERNAL_SECRET"]
    req = urllib.request.Request(
        f"{base}/api/internal/rewrite-citations",
        data=json.dumps({"tenant_id": tenant_id, "variant_id": variant_id}).encode(),
        headers={"Content-Type": "application/json", "x-internal-secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return True, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode())
        except Exception:
            err = {"error": f"HTTP {e.code}"}
        return False, err
    except Exception as e:
        return False, {"error": str(e)}


def main():
    read_env()
    if len(sys.argv) < 2:
        sys.exit("Usage: bulk-rewrite-citations.py <tenant_slug> [--yes]")
    slug = sys.argv[1]
    auto_yes = "--yes" in sys.argv

    tenants = supa("GET", f"/tenants?slug=eq.{slug}&select=id")
    if not tenants:
        sys.exit(f"tenant {slug} not found")
    tenant_id = tenants[0]["id"]

    rows = supa(
        "GET",
        f"/content_variants?select=id,title,platform,compliance_status"
        f"&tenant_id=eq.{tenant_id}"
        f"&deleted_at=is.null"
        f"&status=in.(draft,reviewed)"
        f"&citation_check->>verdict=eq.suspected_hallucination"
        f"&order=created_at.desc",
    )
    rows = rows or []
    print(f"Tenant: {slug}\n找到 {len(rows)} 条 suspected_hallucination 变体待处理。\n")

    if not rows:
        return
    if not auto_yes:
        print("前 5 条:")
        for r in rows[:5]:
            print(f"  - [{r['compliance_status']}] {r['platform']}  {r['title'][:50]}")
        ans = input(f"\n执行批量改写({len(rows)} 条,串行 LLM,大约 {len(rows)} 分钟)? [y/N]: ").strip().lower()
        if ans != "y":
            print("中止")
            return

    succeeded = []
    failed = []
    started = time.time()
    for i, r in enumerate(rows, 1):
        vid = r["id"]
        title = r["title"][:40]
        print(f"\n[{i}/{len(rows)}] {r['platform']}  {title}")
        ok, resp = call_rewrite(tenant_id, vid)
        if ok:
            n_changes = len(resp.get("changes", []))
            succeeded.append(vid)
            print(f"  ✓ 改写成功 ({n_changes} 处修改)")
        else:
            failed.append((vid, resp.get("error", "unknown")))
            print(f"  ✗ 失败: {resp.get('error', 'unknown')[:120]}")

    elapsed = int(time.time() - started)
    print(
        f"\n完成 — 成功 {len(succeeded)}/{len(rows)},失败 {len(failed)}。"
        f"耗时 {elapsed//60}m {elapsed%60}s"
    )
    if failed:
        print("\n失败清单:")
        for vid, err in failed:
            print(f"  {vid}  {err[:100]}")


if __name__ == "__main__":
    main()
