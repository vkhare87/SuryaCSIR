import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { usePMS } from '../../contexts/PMSContext';

export function NotificationBell() {
  const { notifications, markNotificationRead } = usePMS();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unread = notifications.filter(n => !n.read).length;
  const recent = notifications.slice(0, 10);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = async (notif: typeof notifications[0]) => {
    if (!notif.read) await markNotificationRead(notif.id);
    setOpen(false);
    if (notif.reportId) navigate(`/pms/reports/${notif.reportId}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 hover:bg-surface-hover rounded-xl text-text-muted hover:text-text transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 bg-[#c96442] text-[#faf9f5] text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border rounded-2xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="font-semibold text-sm text-text">Notifications</span>
            {unread > 0 && (
              <span className="text-xs text-[#c96442]">{unread} unread</span>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">No notifications</div>
          ) : (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {recent.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors ${
                    !n.read ? 'bg-[#fdf0e8]/40' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c96442]" />
                    )}
                    <div className={!n.read ? '' : 'ml-4'}>
                      <p className="text-sm font-medium text-text">{n.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{n.body}</p>
                      <p className="text-xs text-text-muted/60 mt-1">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
