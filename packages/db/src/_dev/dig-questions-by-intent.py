#!/usr/bin/env python3
"""
One-shot: dig 10 questions × 3 intents (procedure_info / comparison /
risk_concern) via Doubao FAST and insert into questions table active=true.

These 3 intents currently have 0% SOV in our snapshot data — competitors
also have nothing. First mover wins. After this script runs, the question
library should grow by ~30 entries.
"""
import json
import os
import sys
from pathlib import Path
import urllib.request
import urllib.parse


INTENTS_TO_DIG = [
    ("procedure_info", "流程操作类(怎么挑医生、术前要做什么、流程是怎样的)"),
    ("comparison",     "对比类(XX 和 YY 哪个好、进口 vs 国产)"),
    ("risk_concern",   "风险担忧类(XX 有副作用吗、XX 之后多久能恢复、XX 危险吗)"),
]
COUNT_PER_INTENT = 10
TENANT_SLUG = "demo-dental"


def read_env():
    repo_root = Path(__file__).resolve().parents[4]
    for f in (repo_root / ".env.local", repo_root / ".env"):
        if not f.exists(): continue
        for line in f.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line: continue
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
        "Prefer": "return=representation",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} → {e.code}: {e.read().decode()}")


def ark_chat(messages, model, max_tokens=3000, timeout=120):
    base = os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
    key = os.environ["ARK_API_KEY"]
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        j = json.loads(r.read().decode())
        return j["choices"][0]["message"]["content"]


SYSTEM_PROMPT = """你是 GEO 选题策划师。给定行业 + intent 类型,推荐用户在豆包/元宝等 AI 搜索里**真实会问**的问题。

硬约束:
1. 真实搜索口语,第一人称("种植牙怕疼怎么办" ✓ / "种植牙诊疗指南" ✗)
2. 严格对应给定 intent 类型,不混类
3. priority:高频核心问题 8-10,长尾偏门 3-5

输出严格 JSON: {"questions":[{"text":"...","category":"种植/儿牙/正畸/牙周/...","priority":N,"rationale":"..."}, ...]}"""


def dig(industry, intent_label, count, existing_texts):
    user = (
        f"# 行业\n{industry}\n\n"
        f"# 限定 intent\n{intent_label}\n\n"
        f"# 已有问题(避开同义)\n"
        + "\n".join(f"- {t}" for t in existing_texts[:50])
        + f"\n\n# 任务\n推荐 {count} 个**新**问题,只输出 {intent_label.split('(')[0]} 类型的。"
    )
    raw = ark_chat(
        [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
        model="doubao-1-5-pro-32k-250115",
        max_tokens=3000,
    )
    # Robust JSON extraction (matches our extractJson logic)
    try:
        return json.loads(raw)
    except Exception:
        import re
        # try first {...} block
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            return json.loads(m.group(0))
        raise


def main():
    read_env()
    if "ARK_API_KEY" not in os.environ:
        sys.exit("Missing ARK_API_KEY")
    if "SUPABASE_SERVICE_ROLE_KEY" not in os.environ:
        sys.exit("Missing SUPABASE_SERVICE_ROLE_KEY")

    tenants = supa("GET", f"/tenants?slug=eq.{TENANT_SLUG}&select=id,industry")
    if not tenants:
        sys.exit("tenant not found")
    tenant_id = tenants[0]["id"]
    industry = tenants[0]["industry"]

    existing = supa("GET", f"/questions?tenant_id=eq.{tenant_id}&deleted_at=is.null&select=text&limit=200")
    existing_texts = [r["text"] for r in (existing or [])]
    print(f"existing questions in library: {len(existing_texts)}")

    all_inserted = []
    for intent, label in INTENTS_TO_DIG:
        print(f"\n=== Digging {intent} ({label}) ===")
        try:
            res = dig(industry, label, COUNT_PER_INTENT, existing_texts)
        except Exception as e:
            print(f"  ✗ ARK error: {e}")
            continue
        questions = res.get("questions", [])[:COUNT_PER_INTENT]
        print(f"  got {len(questions)} candidates")

        rows = []
        existing_lower = set(t.lower().strip() for t in existing_texts)
        for q in questions:
            text = (q.get("text") or "").strip()
            if not text or text.lower() in existing_lower:
                print(f"  ⊘ dup/empty: {text}")
                continue
            existing_lower.add(text.lower())
            rows.append({
                "tenant_id": tenant_id,
                "text": text[:200],
                "intent": intent,
                "category": (q.get("category") or "").strip()[:40] or None,
                "priority": max(0, min(10, int(q.get("priority", 5)))),
                "active": True,
            })
            print(f"  + P{q.get('priority', 5)} [{(q.get('category') or '?')[:6]}] {text}")
        if rows:
            inserted = supa("POST", "/questions", rows)
            all_inserted.extend(inserted or [])
            existing_texts.extend([r["text"] for r in rows])  # so next intent dedups

    print(f"\nDone — total inserted: {len(all_inserted)}")


if __name__ == "__main__":
    main()
