import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Sparkles } from 'lucide-react';
import { usePMS } from '../../contexts/PMSContext';
import { mergeNotificationFeeds, type BellItem } from '../../lib/notifications/notifications';

export function NotificationBell() {
  const { notifications, appNotifications, markNotificationRead, setAppNotificationStatus } = usePMS();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const items = useMemo(
    () => mergeNotificationFeeds(notifications, appNotifications).filter(n => !n.decided),
    [notifications, appNotifications],
  );
  const unread = items.filter(n => !n.read).length;
  const recent = items.slice(0, 10);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = async (notif: BellItem) => {
    if (!notif.read) {
      await (notif.source === 'pms' ? markNotificationRead(notif.id) : setAppNotificationStatus(notif.id, 'read'));
    }
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };

  // Agent suggestions are decided, not just read: the choice stays on the row
  // (status + updated_at) so suggestion quality can be measured later.
  const accept = async (notif: BellItem) => {
    await setAppNotificationStatus(notif.id, 'accepted');
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };
  const dismiss = (notif: BellItem) => setAppNotificationStatus(notif.id, 'dismissed');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 hover:bg-surface-hover rounded-xl text-text-muted hover:text-text transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 bg-terracotta text-ivory text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-2xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="font-semibold text-sm text-text">Notifications</span>
            {unread > 0 && (
              <span className="text-xs text-terracotta">{unread} unread</span>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">No notifications</div>
          ) : (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {recent.map(n => n.agent ? (
                <div key={n.id} className={`px-4 py-3 ${!n.read ? 'bg-terracotta/5' : ''}`}>
                  <div className="flex items-start gap-2">
                    <Sparkles size={14} className="mt-0.5 shrink-0 text-terracotta" aria-label="Suggestion" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">{n.title}</p>
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-4">{n.body}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void accept(n)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-terracotta text-ivory hover:bg-terracotta-hover"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => void dismiss(n)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-text-muted border border-border hover:text-text"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors ${
                    !n.read ? 'bg-terracotta/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-terracotta" />
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
