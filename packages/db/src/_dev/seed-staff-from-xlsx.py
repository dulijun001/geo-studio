#!/usr/bin/env python3
"""
One-shot seed: import staff matrix from Desktop xlsx into staff_accounts.

Usage:
  python3 packages/db/src/_dev/seed-staff-from-xlsx.py

Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env (.env via dotenv shell or already-exported vars).

Idempotent: matches by (tenant_id, real_name) and merges platforms json so
re-running adds new platform handles without overwriting existing ones.
"""
import os
import sys
import json
from pathlib import Path
import openpyxl
import urllib.request
import urllib.parse

XLSX_PATH = Path("/Users/dulijuner/Desktop/geo账号汇总表.xlsx")
TENANT_SLUG = "demo-dental"


def read_env():
    """Naive .env loader for the few vars we need."""
    repo_root = Path(__file__).resolve().parents[4]
    env_files = [repo_root / ".env.local", repo_root / ".env"]
    for f in env_files:
        if not f.exists():
            continue
        for line in f.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def supa_request(method, path, body=None):
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    url = f"{base}/rest/v1{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()
        raise RuntimeError(f"{method} {path} → {e.code}: {body_txt}")


def main():
    read_env()
    if "NEXT_PUBLIC_SUPABASE_URL" not in os.environ or "SUPABASE_SERVICE_ROLE_KEY" not in os.environ:
        sys.exit("Missing supabase env vars")

    # Resolve tenant + default brand
    tenants = supa_request("GET", f"/tenants?slug=eq.{TENANT_SLUG}&select=id")
    if not tenants:
        sys.exit(f"tenant {TENANT_SLUG} not found")
    tenant_id = tenants[0]["id"]
    brands = supa_request(
        "GET",
        f"/brands?tenant_id=eq.{tenant_id}&deleted_at=is.null&select=id&order=created_at.asc&limit=1",
    )
    if not brands:
        sys.exit(f"no brand for tenant {TENANT_SLUG}")
    brand_id = brands[0]["id"]
    print(f"tenant_id={tenant_id} brand_id={brand_id}")

    # Load xlsx
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb["账号注册表"]

    inserted = merged = skipped = 0
    for row in ws.iter_rows(min_row=5, max_row=ws.max_row, values_only=True):
        name, phone, t_nick, t_url, w_name, w_gh, z_nick, z_url = (
            row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]
        )
        if not name:
            continue
        name = str(name).strip()

        platforms = {}
        if t_nick and str(t_nick).strip():
            entry = {"handle": str(t_nick).strip()}
            if t_url and str(t_url).strip():
                entry["url"] = str(t_url).strip()
            platforms["toutiao_article"] = entry
        if w_gh and str(w_gh).strip():
            platforms["wechat_mp"] = {"handle": str(w_gh).strip(), "name": str(w_name or "").strip() or None}
        elif w_name and str(w_name).strip() and str(w_name).strip() != " ":
            platforms["wechat_mp"] = {"handle": str(w_name).strip()}
        if z_nick and str(z_nick).strip():
            entry = {"handle": str(z_nick).strip()}
            if z_url and str(z_url).strip():
                entry["url"] = str(z_url).strip()
            platforms["zhihu"] = entry

        if not platforms:
            skipped += 1
            print(f"  ⊘ {name}: no platforms filled, skip")
            continue

        # Lookup existing by name
        # PostgREST doesn't natively handle Chinese in eq.* without URL encoding
        existing = supa_request(
            "GET",
            f"/staff_accounts?tenant_id=eq.{tenant_id}&real_name=eq.{urllib.parse.quote(name)}&deleted_at=is.null&select=id,platforms",
        )

        if existing:
            row_id = existing[0]["id"]
            old_platforms = existing[0].get("platforms") or {}
            merged_platforms = {**old_platforms, **platforms}
            patch_body = {
                "platforms": merged_platforms,
                "phone": str(phone) if phone else None,
                "updated_at": "now()",
            }
            # Strip "now()" — let DB default if needed; just remove that key
            del patch_body["updated_at"]
            supa_request(
                "PATCH",
                f"/staff_accounts?id=eq.{row_id}",
                patch_body,
            )
            merged += 1
            print(f"  ↻ merged {name}: +{','.join(platforms.keys())}")
        else:
            ins_body = {
                "tenant_id": tenant_id,
                "brand_id": brand_id,
                "real_name": name,
                "phone": str(phone) if phone else None,
                "role": "other",
                "kind": "operator",
                "status": "active",
                "platforms": platforms,
            }
            supa_request("POST", "/staff_accounts", ins_body)
            inserted += 1
            print(f"  + inserted {name}: {','.join(platforms.keys())}")

    print(f"\nDone — inserted {inserted}, merged {merged}, skipped {skipped}")


if __name__ == "__main__":
    main()
