import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';

export function OfflineServiceBanner() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online && Boolean(supabase)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="px-4 py-2 bg-badge-warning-bg text-badge-warning-fg text-xs flex items-center gap-2 border-b border-border"
    >
      <WifiOff size={14} />
      <span>
        {!online
          ? 'You appear to be offline — live queries and submissions will resume once reconnected.'
          : 'Backend connection is not configured in this environment.'}
      </span>
    </div>
  );
}
