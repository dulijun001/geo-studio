'use client';

import { useState, useTransition } from 'react';
import { queryAuditLogs, type AuditRow } from './actions';

export function ExportButton({
  tenantSlug,
  action,
  from,
  to,
}: {
  tenantSlug: string;
  action: string;
  from: string;
  to: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    setErr(null);
    start(async () => {
      try {
        const rows = await queryAuditLogs(tenantSlug, { action, from, to });
        downloadCsv(rows, `audit-${tenantSlug}-${new Date().toISOString().slice(0, 10)}.csv`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '导出失败');
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? '导出中…' : '导出 CSV'}
      </button>
      {err ? <span className="text-[11px] text-rose-700">{err}</span> : null}
    </div>
  );
}

function downloadCsv(rows: AuditRow[], filename: string) {
  const header = ['created_at', 'action', 'target_type', 'target_id', 'actor_user_id', 'payload'];
  const body = rows.map((r) =>
    [
      r.created_at,
      r.action,
      r.target_type ?? '',
      r.target_id ?? '',
      r.actor_user_id ?? '',
      r.payload ? JSON.stringify(r.payload) : '',
    ]
      .map(csvCell)
      .join(','),
  );
  // BOM so Excel reads UTF-8 instead of garbling Chinese.
  const blob = new Blob(['﻿', [header.join(','), ...body].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
