// Shared UI pieces: badges, avatar, loading/empty states, modal, toasts.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, CircleCheck, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useMeta } from '../meta.jsx';
import { BADGE_ICONS, CategoryIcon, Icon, StatusIcon, STROKE } from '../icons.jsx';
import { initials } from '../utils.js';

// badges and states
export function StatusBadge({ status }) {
  const { status: statuses } = useMeta();
  return (
    <span className={`status st-${status}`}>
      <StatusIcon id={status} size={14} />
      {statuses?.[status]?.label || status}
    </span>
  );
}

export function CategoryLabel({ category, size = 15 }) {
  const { category: cats } = useMeta();
  const c = cats?.[category];
  return (
    <span className="cat" style={{ '--c': c?.color }}>
      <CategoryIcon id={category} size={size} />
      <span className="cat-text">{c?.label || category}</span>
    </span>
  );
}

// A badge as a round medal in its own colour with the name inside; grey until earned.
export function BadgeMedal({ badge, locked = false, showDesc = true }) {
  return (
    <div className={`badge-item ${locked ? 'locked' : ''}`} style={{ '--c': badge.color }}>
      <div className="badge-medal">
        <Icon as={BADGE_ICONS[badge.id]} size={30} />
        <span className="badge-name">{badge.label}</span>
      </div>
      {showDesc && (
        <p className="badge-desc">
          {locked && <span className="sr-only">Not earned yet. </span>}
          {badge.description}
        </p>
      )}
    </div>
  );
}

// A council's logo from client/public/councils/<ID>.png; falls back to a tile with the council code.
export function CouncilLogo({ id, size = 40 }) {
  const [failed, setFailed] = useState(false);
  if (!id) return null;
  return (
    <span className="council-logo" style={{ width: size, height: size }} aria-hidden="true">
      {failed ? (
        <span className="council-logo-code">{id}</span>
      ) : (
        <img src={`/councils/${id}.png`} alt="" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

export function Avatar({ user, size }) {
  return (
    <span className={`avatar ${size || ''} ${user?.role === 'official' ? 'official' : ''}`} aria-hidden="true">
      {initials(user?.name)}
    </span>
  );
}

export function Spinner({ size = 18 }) {
  return <LoaderCircle className="spinner" size={size} strokeWidth={STROKE} aria-label="Loading" />;
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="center-load">
      <div className="row">
        <Spinner /> <span>{label}</span>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon && (
        <div className="ic">
          <Icon as={icon} size={24} />
        </div>
      )}
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

// dropdown
// Styled replacement for <select> (a native menu can't be styled when open).
// options: [{ value, label, icon, hint, className }]. Keyboard: arrows, Home/End, Enter, Esc.
export function Dropdown({ value, onChange, options, label, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);
  const id = useId();
  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const choose = (o) => {
    onChange(o.value);
    setOpen(false);
  };

  function onKey(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const last = options.length - 1;
    if (e.key === 'ArrowDown') setActive((i) => Math.min(last, i + 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') choose(options[active]);
    else if (e.key === 'Escape') setOpen(false);
    else {
      if (e.key === 'Tab') setOpen(false);
      return;
    }
    e.preventDefault();
  }

  return (
    <div className={`dd ${open ? 'open' : ''}`} ref={ref}>
      <button
        type="button"
        className="select dd-trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-label={`${label}: ${current?.label}`}
      >
        <span className={`dd-ic ${current?.className || ''}`} style={current?.color ? { color: current.color } : undefined}>
          {current?.icon && <Icon as={current.icon} size={16} />}
        </span>
        <span className="dd-value">{current?.label}</span>
        <ChevronDown className="dd-chev" size={16} strokeWidth={STROKE} aria-hidden="true" />
      </button>
      {open && (
        <div className={`dd-pop ${align === 'right' ? 'right' : ''}`}>
          <div className="dd-label">{label}</div>
          <ul className="dd-list" role="listbox" id={`${id}-list`} aria-label={label} ref={listRef}>
            {options.map((o, i) => {
              const selected = o.value === current?.value;
              return (
                <li
                  key={o.value}
                  id={`${id}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={selected}
                  className={`dd-opt ${selected ? 'selected' : ''} ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  <span className={`dd-ic ${o.className || ''}`} style={o.color ? { color: o.color } : undefined}>
                    {o.icon && <Icon as={o.icon} size={16} />}
                  </span>
                  <span className="grow">
                    <span className="dd-opt-label">{o.label}</span>
                    {o.hint && <span className="dd-hint">{o.hint}</span>}
                  </span>
                  {selected && <Check className="dd-check" size={16} strokeWidth={2} aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// sheet
// Bottom sheet on phones, centred panel on larger screens. Locks page scroll while open.
export function Sheet({ title, onClose, children, className = '' }) {
  const ref = useRef(null);

  // Keep the sheet above the on-screen keyboard (iOS does not resize the page for it).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const fit = () => ref.current?.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="backdrop sheet-backdrop" ref={ref} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * iOS only opens the keyboard when focus happens inside the tap itself.
 * Call this in the tap handler, before showing a sheet whose input autofocuses.
 */
export function primeKeyboard() {
  const el = document.createElement('input');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;height:0;width:0;font-size:16px;pointer-events:none;';
  document.body.appendChild(el);
  el.focus();
  setTimeout(() => el.remove(), 1000);
}

// modal
export function Modal({ title, onClose, children, footer }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, textarea, select, button:not([data-close])');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close" data-close>
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Small confirm dialog for destructive actions (error prevention). */
export function Confirm({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}

// toasts
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (message, { type = 'ok', action, duration = 4000 } = {}) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, type, action }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      ok: (m, o) => show(m, { ...o, type: 'ok' }),
      error: (m, o) => show(typeof m === 'string' ? m : m?.message || 'Something went wrong.', { duration: 6000, ...o, type: 'error' }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`}>
            {t.type === 'error' ? <TriangleAlert size={18} strokeWidth={STROKE} /> : <CircleCheck size={18} strokeWidth={STROKE} />}
            <span className="grow">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
