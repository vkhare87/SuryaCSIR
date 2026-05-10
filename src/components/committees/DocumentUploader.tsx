import { useState, useMemo, useCallback } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { useData } from '../../contexts/DataContext';
import type { MeetingDocument } from '../../types';

interface DocumentUploaderProps {
  meetingId: string;
  committeeId: string;
  canUpload: boolean;
}

export function DocumentUploader({ meetingId, committeeId, canUpload }: DocumentUploaderProps) {
  const { meetingDocs, refreshData } = useData();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const docs = useMemo(
    () => meetingDocs.filter((d) => d.meeting_id === meetingId),
    [meetingDocs, meetingId],
  );

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const path = `${committeeId}/${meetingId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase!
        .storage.from('committee-docs')
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase!
        .from('meeting_documents')
        .insert({ meeting_id: meetingId, file_name: file.name, storage_path: path });
      if (insertErr) throw insertErr;

      await refreshData?.();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [committeeId, meetingId, refreshData]);

  const handleDownload = useCallback(async (storagePath: string, fileName: string) => {
    const { data, error } = await supabase!
      .storage.from('committee-docs')
      .download(storagePath);
    if (error || !data) { console.error('Download failed:', error); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleDelete = useCallback(async (doc: MeetingDocument) => {
    await supabase!.storage.from('committee-docs').remove([doc.storage_path]);
    await supabase!.from('meeting_documents').delete().eq('id', doc.id);
    await refreshData?.();
  }, [refreshData]);

  return (
    <div>
      {canUpload && (
        <div className="mb-4">
          <label className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg cursor-pointer hover:bg-surface-hover text-sm">
            <Upload size={14} />
            {uploading ? 'Uploading...' : 'Upload Document'}
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xlsx,.png,.jpg"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          {uploadError && (
            <p className="text-red-500 text-xs mt-1">{uploadError}</p>
          )}
        </div>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-text-muted italic">No documents uploaded.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-2 bg-surface border border-border rounded-lg"
            >
              <FileText size={16} className="text-text-muted" />
              <span className="flex-1 text-sm text-text">{doc.file_name}</span>
              <span className="text-xs text-text-muted">{doc.uploaded_at}</span>
              <button
                onClick={() => handleDownload(doc.storage_path, doc.file_name)}
                className="text-[#c96442] hover:underline text-xs"
              >
                Download
              </button>
              {canUpload && (
                <button
                  onClick={() => handleDelete(doc)}
                  className="text-text-muted hover:text-red-500"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
