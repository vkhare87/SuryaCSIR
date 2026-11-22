import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../ui/Cards';

export function MfaEnrollmentCard() {
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase?.auth?.mfa) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setVerifiedCount(data?.totp?.filter((f) => f.status === 'verified').length ?? 0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEnroll = async () => {
    if (!supabase?.auth?.mfa) return;
    setErr(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SURYA Authenticator' });
    if (error) {
      setErr(error.message);
      return;
    }
    setFactorId(data.id);
    setQrSvg(data.totp.qr_code);
  };

  const verifyCode = async () => {
    if (!supabase?.auth?.mfa || !factorId || !code.trim()) return;
    setErr(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) {
      setErr(error.message);
      return;
    }
    setQrSvg(null);
    setFactorId(null);
    setCode('');
    setMsg('TOTP 2FA enabled.');
    await load();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <ShieldCheck size={14} /> Two-Factor Authentication (TOTP)
        </h2>
        <span className="text-xs font-mono text-text-muted">
          {verifiedCount > 0 ? `${verifiedCount} active` : 'Not enrolled'}
        </span>
      </div>
      {err && <p className="text-xs text-error-crimson">{err}</p>}
      {msg && <p className="text-xs text-archive-green">{msg}</p>}
      {!qrSvg ? (
        <button
          type="button"
          onClick={startEnroll}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text hover:bg-surface-hover"
        >
          Enroll authenticator app
        </button>
      ) : (
        <div className="space-y-2">
          <img src={qrSvg} alt="Scan TOTP QR code" className="w-36 h-36 rounded border border-border bg-ivory p-1" />
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              className="px-2.5 py-1 rounded border border-border bg-background text-xs font-mono text-text"
            />
            <button
              type="button"
              onClick={verifyCode}
              className="px-3 py-1 rounded bg-terracotta text-ivory text-xs font-semibold"
            >
              Verify &amp; activate
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
