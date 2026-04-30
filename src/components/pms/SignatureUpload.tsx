import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  currentUrl: string | null;
  onUpload: (file: File) => Promise<void>;
}

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png'];

export function SignatureUpload({ currentUrl, onUpload }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!ALLOWED.includes(file.type)) { setError('JPEG or PNG only'); return; }
    if (file.size > MAX_BYTES)        { setError('Max 2 MB'); return; }
    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const clearPreview = () => {
    setPreview(null);
    if (ref.current) ref.current.value = '';
  };

  const displayUrl = preview ?? currentUrl;

  return (
    <div className="space-y-3">
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {displayUrl ? (
        <div className="relative inline-block">
          <img
            src={displayUrl}
            alt="Signature"
            className="h-24 border border-border rounded-lg object-contain bg-white p-2"
          />
          <button
            onClick={clearPreview}
            className="absolute -top-2 -right-2 bg-white border border-border rounded-full p-0.5 text-text-muted hover:text-rose-600"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => ref.current?.click()}
          className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-[#c96442] transition-colors text-text-muted"
        >
          <Upload size={20} className="mb-1" />
          <span className="text-xs">Click to upload signature</span>
          <span className="text-xs opacity-60">JPEG / PNG · max 2 MB</span>
        </div>
      )}
      {uploading && <p className="text-xs text-text-muted">Uploading…</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {!displayUrl && (
        <Button variant="secondary" size="sm" onClick={() => ref.current?.click()}>
          Choose File
        </Button>
      )}
    </div>
  );
}
