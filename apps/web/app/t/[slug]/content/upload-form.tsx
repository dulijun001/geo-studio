'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { createUploadSlot, enqueueParse } from './actions';

const ACCEPT = '.docx,.doc,.pdf,.md,.txt';

const EXTRA_MIME_OVERRIDES: Record<string, string> = {
  // Chinese Windows often emits application/octet-stream for .docx — normalize.
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
};

function normalizeMime(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTRA_MIME_OVERRIDES[ext] ?? 'application/octet-stream';
}

export function UploadForm({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'creating' | 'uploading' | 'queueing'>('idle');

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setStage('creating');
      const mime = normalizeMime(file);
      const slot = await createUploadSlot(tenantSlug, {
        title: file.name.replace(/\.[^.]+$/, ''),
        mime,
        filename: file.name,
      });

      setStage('uploading');
      const supabase = createSupabaseBrowserClient();
      const { error: uploadErr } = await supabase.storage
        .from('content-uploads')
        .uploadToSignedUrl(slot.signed_upload.path, slot.signed_upload.token, file, {
          contentType: mime,
          upsert: false,
        });
      if (uploadErr) throw new Error(uploadErr.message);

      setStage('queueing');
      await enqueueParse(tenantSlug, slot.content_item_id, mime);

      setStage('idle');
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setStage('idle');
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const label =
    stage === 'creating'
      ? '创建中…'
      : stage === 'uploading'
        ? '上传中…'
        : stage === 'queueing'
          ? '排队解析…'
          : '上传文件';

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          disabled={busy}
          onChange={handleChange}
          className="hidden"
        />
        {label}
      </label>
      <span className="text-xs text-muted-foreground">支持 .docx / .doc / .pdf / .md / .txt · 最大 50MB</span>
      {error && (
        <p className="mt-1 rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
