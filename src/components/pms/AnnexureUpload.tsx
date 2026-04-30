import { useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import type { PMSAnnexure } from '../../types/pms';

interface Props {
  annexures: PMSAnnexure[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (annexureId: string, filePath: string) => Promise<void>;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];

export function AnnexureUpload({ annexures, onUpload, onDelete }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Allowed: PDF, Word, JPEG, PNG');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await onUpload(file);
      if (ref.current) ref.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={ref}
        type="file"
        accept=".pdf,.doc,.docx,image/jpeg,image/png"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {annexures.length > 0 && (
        <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
          {annexures.map(a => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 bg-surface">
              <div>
                <p className="text-sm text-text">{a.fileName}</p>
                <p className="text-xs text-text-muted">{(a.fileSize / 1024).toFixed(0)} KB</p>
              </div>
              <button
                onClick={() => onDelete(a.id, a.filePath)}
                className="p-1.5 text-text-muted hover:text-rose-600 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" isLoading={uploading} onClick={() => ref.current?.click()}>
          <Upload size={14} className="mr-1" /> Add Annexure
        </Button>
        <span className="text-xs text-text-muted">PDF, Word, JPEG, PNG</span>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
