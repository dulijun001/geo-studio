#!/usr/bin/env python3
"""
扫描 KB markdown 找出仍含违规绝对化用语的文件 + 行号。
输出 ops/kb-compliance-report.md 给运营/医生统一改 KB,断绝污染源。
"""
import re
import os
from pathlib import Path

KB_ROOT = Path(os.environ.get("HOME", "/")) / "Workspace/songshu-knowledge-base"
REPORT = Path(__file__).resolve().parents[4] / "ops/kb-compliance-report.md"

# 违规模式 (severity: critical=罚款 / warning=有风险但可救)
PATTERNS = [
    ("critical", "国内唯一", "绝对化资质,违反广告法第九条"),
    ("critical", "国内首家", "绝对化"),
    ("critical", "全国唯一", "绝对化"),
    ("critical", r"\d+\s*项国际金标准", "自创国际权威,严重误导"),
    ("critical", "国际金标准", "自创国际权威"),
    ("critical", "包治", "效果承诺,违法"),
    ("critical", "根治", "效果承诺"),
    ("critical", "无效退款", "效果承诺"),
    ("critical", r"治愈率(?![低小])", "效果承诺"),
    ("critical", "100%(?:有效|安全|无痛|成功)", "绝对化数字承诺"),
    ("critical", "无痛(?:种植|手术|治疗|拔牙)", "安全性夸大"),
    ("critical", "零(?:风险|痛|并发症)", "安全性夸大"),
    ("critical", "永久(?:解决|根除|有效)", "永久承诺"),
    ("warning", "(?<!不|可)最(?:专业|权威|好|强|优秀|安全|先进)", "绝对化形容词"),
    ("warning", "顶尖", "绝对化"),
    ("warning", "独家(?:技术|疗法|权威)?", "绝对化"),
    ("warning", "行业(?:领先|第一|顶尖)", "比较违规"),
    ("warning", "碾压同行", "比较违规"),
    ("warning", "立竿见影", "效果承诺"),
    ("warning", "终身维护", "永久承诺"),
]

def scan():
    if not KB_ROOT.exists():
        print(f"❌ KB not found: {KB_ROOT}")
        return
    findings = []
    files_scanned = 0
    for path in KB_ROOT.rglob("*.md"):
        files_scanned += 1
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for sev, pat, why in PATTERNS:
                if re.search(pat, line):
                    findings.append({
                        "file": str(path.relative_to(KB_ROOT)),
                        "line": lineno,
                        "severity": sev,
                        "match": re.search(pat, line).group(0),
                        "why": why,
                        "context": line.strip()[:200],
                    })
    # also .txt files (老版咨询师手册)
    for path in KB_ROOT.rglob("*.txt"):
        files_scanned += 1
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for sev, pat, why in PATTERNS:
                if re.search(pat, line):
                    findings.append({
                        "file": str(path.relative_to(KB_ROOT)),
                        "line": lineno,
                        "severity": sev,
                        "match": re.search(pat, line).group(0),
                        "why": why,
                        "context": line.strip()[:200],
                    })
    print(f"扫描 {files_scanned} 个文件,发现 {len(findings)} 处违规")

    # 按文件 + severity 聚合
    by_file = {}
    for f in findings:
        by_file.setdefault(f["file"], []).append(f)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open("w") as out:
        critical_count = sum(1 for f in findings if f["severity"] == "critical")
        warning_count = sum(1 for f in findings if f["severity"] == "warning")
        affected_files = len(by_file)
        out.write(f"# KB 合规扫描报告\n\n")
        out.write(f"扫描时间: 自动\n")
        out.write(f"扫描范围: `{KB_ROOT}` 下所有 .md / .txt\n")
        out.write(f"文件总数: {files_scanned}\n\n")
        out.write(f"## 摘要\n\n")
        out.write(f"- 受影响文件: **{affected_files}** 个\n")
        out.write(f"- 🔴 Critical(直接违法,**必须改**): **{critical_count}** 处\n")
        out.write(f"- 🟡 Warning(高风险,**建议改**): **{warning_count}** 处\n\n")
        out.write(f"## 修复优先级\n\n")
        out.write(f"按 critical 数量倒序排列。先改 critical 多的文件。\n\n")
        # rank by critical count
        ranked = sorted(by_file.items(), key=lambda kv: sum(1 for f in kv[1] if f["severity"]=="critical"), reverse=True)
        for fname, hits in ranked:
            crit = sum(1 for h in hits if h["severity"]=="critical")
            warn = sum(1 for h in hits if h["severity"]=="warning")
            out.write(f"\n### `{fname}` (🔴 {crit} / 🟡 {warn})\n\n")
            for h in hits:
                icon = "🔴" if h["severity"] == "critical" else "🟡"
                out.write(f"- {icon} **第 {h['line']} 行**: 命中 `{h['match']}` — {h['why']}\n")
                out.write(f"  > {h['context']}\n")
    print(f"报告写入: {REPORT}")

if __name__ == "__main__":
    scan()
