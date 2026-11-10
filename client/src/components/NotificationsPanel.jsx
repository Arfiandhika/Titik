import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon, NOTIFICATION_ICONS, STROKE } from '../icons.jsx';
import { timeAgo } from '../utils.js';
import { Spinner, useToast } from './ui.jsx';

// FR11: the bell opens a dropdown with the latest notifications (a sheet on phones).
export default function NotificationsPanel() {
  const { unread, setUnread } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const ref = useRef(null);

  // Close on page change, outside click and Escape.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Load fresh each time it opens.
  useEffect(() => {
    if (!open) return undefined;
    const ctrl = new AbortController();
    api('/notifications', { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setUnread(d.unread);
      })
      .catch((e) => e.name !== 'AbortError' && toast.error(e));
    return () => ctrl.abort();
  }, [open, setUnread, toast]);

  async function markAll() {
    try {
      await api('/notifications/read', { method: 'POST', body: {} });
      setData((d) => ({ ...d, unread: 0, notifications: d.notifications.map((n) => ({ ...n, read: true })) }));
      setUnread(0);
    } catch (e) {
      toast.error(e);
    }
  }

  function pick(n) {
    if (!n.read) {
      api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => {});
      setUnread((u) => Math.max(0, u - 1));
      setData((d) => ({ ...d, unread: Math.max(0, d.unread - 1), notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }));
    }
    const to = n.reportId ? `/reports/${n.reportId}` : n.type === 'reward' ? '/rewards' : null;
    if (to) {
      setOpen(false);
      navigate(to);
    }
  }

  const count = data ? data.unread : unread;

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={`icon-btn bell ${open ? 'on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell size={20} strokeWidth={STROKE} aria-hidden="true" />
        {unread > 0 && <span className="dot-count">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-pop" role="dialog" aria-label="Notifications">
          <div className="notif-pop-head">
            <div>
              <div className="strong">Notifications</div>
              <div className="tiny muted">{!data ? 'Loading' : count ? `${count} unread` : 'All caught up'}</div>
            </div>
            {count > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={markAll}>
                <CheckCheck size={16} strokeWidth={STROKE} /> Mark all read
              </button>
            )}
          </div>
          <div className="notif-pop-list">
            {!data ? (
              <div className="center-load" style={{ padding: 32 }}>
                <Spinner />
              </div>
            ) : data.notifications.length === 0 ? (
              <div className="empty" style={{ padding: '32px 20px' }}>
                <div className="ic">
                  <Icon as={BellOff} size={22} />
                </div>
                <h3>No notifications yet</h3>
                <p className="small">You will hear here when your reports move along.</p>
              </div>
            ) : (
              data.notifications.map((n) => (
                <button key={n.id} type="button" className={`notif ${n.read ? '' : 'unread'}`} onClick={() => pick(n)}>
                  <span className="ic">
                    <Icon as={NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.info} size={17} />
                  </span>
                  <span>
                    <span className="msg">{n.message}</span>
                    <br />
                    <span className="tiny muted">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read ? <span className="unread-dot" aria-label="Unread" /> : <span />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
