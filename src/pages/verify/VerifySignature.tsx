import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui/Cards';
import { verifySignatureCode, type SignatureVerification } from '../../lib/home/stage4Api';

export default function VerifySignature() {
  const { code: routeCode } = useParams<{ code?: string }>();
  const [code, setCode] = useState(routeCode ?? '');
  const [result, setResult] = useState<SignatureVerification | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runVerify = async (target: string) => {
    if (!target.trim()) return;
    setBusy(true);
    setErr(null);
    setChecked(false);
    try {
      const res = await verifySignatureCode(target.trim());
      setResult(res);
      setChecked(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (routeCode) {
      setCode(routeCode);
      void runVerify(routeCode);
    }
  }, [routeCode]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runVerify(code);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="text-xl font-[500] font-serif text-text flex items-center gap-2">
          <ShieldCheck size={20} className="text-terracotta" /> Verify Signed Record
        </h1>
        <p className="text-xs text-text-muted">
          Confirm the signer, timestamp, and hash-chain integrity of an attested SURYA document.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter verification code (e.g. SURYA-…)"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-text"
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="px-4 py-2 rounded-lg bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold disabled:opacity-50"
          >
            Verify
          </button>
        </form>
      </Card>

      {err && <p className="text-xs text-error-crimson">{err}</p>}

      {checked && !result && (
        <Card className="p-4 flex items-center gap-2 text-xs text-error-crimson">
          <ShieldAlert size={16} /> No signature record found for code {code}.
        </Card>
      )}

      {result && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {result.valid ? (
              <span className="inline-flex items-center gap-1.5 text-archive-green">
                <CheckCircle2 size={16} /> Hash chain verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-error-crimson">
                <ShieldAlert size={16} /> Hash mismatch
              </span>
            )}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-text-muted">Verification Code</dt>
              <dd className="font-mono text-text">{result.verification_code}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Signer</dt>
              <dd className="text-text font-medium">{result.signer_name} ({result.level})</dd>
            </div>
            <div>
              <dt className="text-text-muted">Record</dt>
              <dd className="font-mono text-text">{result.subject_type} · {result.subject_id}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Signed At</dt>
              <dd className="font-mono text-text">{new Date(result.signed_at).toLocaleString()}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Chain Hash</dt>
              <dd className="font-mono text-[11px] text-text break-all">{result.chain_hash}</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
