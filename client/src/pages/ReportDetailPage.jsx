import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Share2,
  ShieldAlert,
  Merge,
  ArrowRightLeft,
  CircleX,
  Sparkles,
  ShieldCheck,
  FileQuestion,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { STROKE } from '../icons.jsx';
import { dateTime, distance, timeAgo } from '../utils.js';
import { CategoryLabel, Empty, Loading, Spinner, StatusBadge, Modal, Confirm, useToast } from '../components/ui.jsx';
import VoteButtons from '../components/VoteButtons.jsx';
import Comments from '../components/Comments.jsx';
import StatusTimeline, { StatusSteps } from '../components/StatusTimeline.jsx';
import { ReportMap } from '../components/GoogleMap.jsx';

export default function ReportDetailPage() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const { meta, category: cats } = useMeta();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    return api(`/reports/${id}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e));
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load, user?.id]);

  const onCount = useCallback(() => {}, []);

  if (error) {
    return (
      <div className="page narrow">
        <Empty icon={FileQuestion} title={error.status === 404 ? 'Report not found' : 'Could not load this report'} action={<Link to="/" className="btn">All reports</Link>}>
          {error.status === 404 ? 'It may have been deleted by the person who posted it.' : error.message}
        </Empty>
      </div>
    );
  }
  if (!data) return <Loading />;

  const r = data.report;
  const setReport = (report) => setData((d) => ({ ...d, report }));

  async function remove() {
    try {
      await api(`/reports/${r.id}`, { method: 'DELETE' });
      refresh();
      toast.ok('Report deleted.');
      navigate('/?tab=mine', { replace: true });
    } catch (err) {
      toast.error(err);
      setDeleting(false);
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: r.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.ok('Link copied.');
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="page">
      <button type="button" className="back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
        <ArrowLeft size={16} strokeWidth={STROKE} /> Back
      </button>

      <div className="detail">
        <div className="stack lg">
          <div className="stack" style={{ gap: 10 }}>
            <div className="row wrap">
              <CategoryLabel category={r.category} />
              <StatusBadge status={r.status} />
              {r.hoaxFlagged && (
                <span className="tag danger">
                  <ShieldAlert size={12} strokeWidth={STROKE} /> Flagged as possible hoax
                </span>
              )}
            </div>
            <h1>{r.title}</h1>
            <p className="small muted">
              Reported by{' '}
              <Link to={`/users/${r.reporter.id}`} style={{ color: 'var(--text)' }}>
                {r.reporter.name}
              </Link>{' '}
              · {timeAgo(r.createdAt)} · #{r.id}
            </p>
          </div>

          {r.mergedInto && (
            <div className="notice">
              <Merge size={17} strokeWidth={STROKE} />
              <span>
                This was the same issue as <Link to={`/reports/${r.mergedInto}`}>report #{r.mergedInto}</Link>. Follow that report for updates.
              </span>
            </div>
          )}
          {r.status === 'rejected' && !r.mergedInto && r.rejectReason && (
            <div className="notice danger">
              <CircleX size={17} strokeWidth={STROKE} />
              <span>
                <strong>Rejected by the council.</strong> {r.rejectReason}
              </span>
            </div>
          )}

          <img className="hero-photo" src={r.photoUrl} alt={`Photo of ${r.title}`} />

          {!r.mergedInto && r.status !== 'rejected' && <StatusSteps status={r.status} />}

          {r.description && <p style={{ whiteSpace: 'pre-wrap' }}>{r.description}</p>}

          <VoteButtons report={r} onChange={setReport} />

          {r.isMine && r.status === 'submitted' && (
            <div className="row wrap">
              <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
                <Pencil size={15} strokeWidth={STROKE} /> Edit
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setDeleting(true)}>
                <Trash2 size={15} strokeWidth={STROKE} /> Delete
              </button>
              <span className="hint">You can change this report until the council starts reviewing it.</span>
            </div>
          )}

          <section className="card">
            <h2 style={{ marginBottom: 14 }}>Comments</h2>
            <Comments reportId={r.id} onCount={onCount} />
          </section>
        </div>

        <aside className="stack lg">
          {data.canManage && <StaffPanel data={data} onDone={load} />}

          <section className="card stack">
            <div className="card-title" style={{ marginBottom: 0 }}>
              <h2>Details</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
                <Share2 size={15} strokeWidth={STROKE} /> Share
              </button>
            </div>
            <dl className="facts">
              <dt>Council</dt>
              <dd>{r.authorityName}</dd>
              <dt>Location</dt>
              <dd>{r.address || `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`}</dd>
              {r.accuracy != null && (
                <>
                  <dt>GPS</dt>
                  <dd>accurate to about {distance(r.accuracy)}</dd>
                </>
              )}
              <dt>Reported</dt>
              <dd>{dateTime(r.createdAt)}</dd>
              <dt>Updated</dt>
              <dd>{dateTime(r.updatedAt)}</dd>
              {r.aiCategory && (
                <>
                  <dt>AI hint</dt>
                  <dd className="row" style={{ gap: 6 }}>
                    <Sparkles size={14} strokeWidth={STROKE} style={{ color: 'var(--primary)' }} />
                    {cats[r.aiCategory]?.label}
                    {r.aiCategory !== r.category && <span className="muted small">(resident chose differently)</span>}
                  </dd>
                </>
              )}
            </dl>
            <div className="mini-map">
              <ReportMap reports={[r]} selectedId={r.id} center={{ lat: r.lat, lng: r.lng }} zoom={16} />
            </div>
            <a className="small" href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">
              Directions in Google Maps
            </a>
          </section>

          <section className="card">
            <h2 style={{ marginBottom: 16 }}>Progress</h2>
            <StatusTimeline history={data.history} />
            {data.mergedFrom.length > 0 && (
              <p className="small muted" style={{ marginTop: 14 }}>
                Combined with: {data.mergedFrom.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ', '}
                    <Link to={`/reports/${m.id}`}>#{m.id}</Link>
                  </span>
                ))}
              </p>
            )}
          </section>

          {!user && (
            <div className="notice small">
              <ShieldCheck size={16} strokeWidth={STROKE} />
              <span>
                <Link to="/login" state={{ from: `/reports/${r.id}` }}>
                  Sign in
                </Link>{' '}
                to say "Me too", flag a hoax or comment.
              </span>
            </div>
          )}
        </aside>
      </div>

      {editing && <EditModal report={r} categories={meta.categories} onClose={() => setEditing(false)} onSaved={(rep) => { setReport(rep); setEditing(false); toast.ok('Changes saved.'); }} />}
      {deleting && (
        <Confirm
          title="Delete this report?"
          message={`"${r.title}" will be removed for everyone, and the ${meta.points.REPORT} points you earned for it will be taken back. This cannot be undone.`}
          confirmLabel="Delete report"
          danger
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

function EditModal({ report, categories, onClose, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState(report.title);
  const [description, setDescription] = useState(report.description);
  const [category, setCategory] = useState(report.category);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.append('title', title);
      form.append('description', description);
      form.append('category', category);
      const { report: updated } = await api(`/reports/${report.id}`, { method: 'PATCH', form });
      onSaved(updated);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit report" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="field">
          <label className="label" htmlFor="e-title">
            Title
          </label>
          <input id="e-title" className="input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="e-cat">
            Category
          </label>
          <select id="e-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="e-desc">
            Details
          </label>
          <textarea id="e-desc" className="textarea" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="modal-foot" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || title.trim().length < 3}>
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Staff panel: FR10 status, FR16 forward, FR18 reject reason, FR19 merge.
// ---------------------------------------------------------------------------
function StaffPanel({ data, onDone }) {
  const { meta, status: statuses } = useMeta();
  const { user } = useAuth();
  const toast = useToast();
  const r = data.report;
  const [mode, setMode] = useState(null);
  const [to, setTo] = useState(data.allowedStatuses[0] || '');
  const [note, setNote] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [mergeInto, setMergeInto] = useState('');
  const [nearby, setNearby] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTo(data.allowedStatuses[0] || '');
  }, [data.allowedStatuses]);

  useEffect(() => {
    if (mode !== 'merge' || nearby) return;
    api(`/reports/duplicates${qs({ lat: r.lat, lng: r.lng, accuracy: 150, category: r.category })}`)
      .then(({ reports }) => setNearby(reports.filter((x) => x.id !== r.id)))
      .catch(() => setNearby([]));
  }, [mode, nearby, r]);

  const closed = ['resolved', 'rejected'].includes(r.status);
  const reasonNeeded = to === 'rejected';

  async function run(fn, okMsg) {
    setBusy(true);
    try {
      await fn();
      toast.ok(okMsg);
      setMode(null);
      setNote('');
      await onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const updateStatus = (e) => {
    e.preventDefault();
    run(() => api(`/reports/${r.id}/status`, { method: 'PATCH', body: { status: to, note } }), `Marked ${statuses[to].label.toLowerCase()}. The reporter was notified.`);
  };
  const forward = (e) => {
    e.preventDefault();
    run(() => api(`/reports/${r.id}/forward`, { method: 'POST', body: { authority: forwardTo, note } }), 'Report forwarded.');
  };
  const merge = (e) => {
    e.preventDefault();
    run(() => api(`/reports/${r.id}/merge`, { method: 'POST', body: { intoId: Number(mergeInto) } }), `Merged into report #${mergeInto}.`);
  };
  const clearFlag = () => run(() => api(`/reports/${r.id}/clear-flag`, { method: 'POST' }), 'Hoax flag cleared.');

  return (
    <section className="card staff-panel stack">
      <div className="card-title" style={{ marginBottom: 0 }}>
        <h2>Council actions</h2>
        <span className="tag accent">{user.authority}</span>
      </div>
      {!r.authority && <p className="small muted">This report is outside every council area. Take it on or forward it.</p>}

      {r.hoaxFlagged && (
        <div className="notice danger small" style={{ alignItems: 'center' }}>
          <ShieldAlert size={16} strokeWidth={STROKE} />
          <span className="grow">
            {r.hoax} residents flagged this as a hoax. Check it, then reject it or clear the flag.
          </span>
          <button type="button" className="btn btn-sm" onClick={clearFlag} disabled={busy}>
            Clear flag
          </button>
        </div>
      )}

      {data.allowedStatuses.length > 0 && (
        <form className="stack" onSubmit={updateStatus}>
          <div className="field">
            <label className="label" htmlFor="st-to">
              Update status
            </label>
            <select id="st-to" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              {data.allowedStatuses.map((s) => (
                <option key={s} value={s}>
                  {statuses[s].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="st-note">
              {reasonNeeded ? 'Reason for rejecting' : 'Note to residents'} {!reasonNeeded && <span className="opt">(optional)</span>}
            </label>
            <textarea
              id="st-note"
              className="textarea"
              style={{ minHeight: 70 }}
              value={note}
              maxLength={500}
              placeholder={reasonNeeded ? 'Tell the resident why, in plain words.' : 'e.g. Crew scheduled for Thursday.'}
              onChange={(e) => setNote(e.target.value)}
            />
            {reasonNeeded && <span className="hint">Required. The reporter and supporters will see this.</span>}
          </div>
          <button className={`btn ${reasonNeeded ? 'btn-danger' : 'btn-primary'}`} disabled={busy || !to || (reasonNeeded && note.trim().length < 5)}>
            {busy && <Spinner size={16} />} {reasonNeeded ? 'Reject report' : `Mark ${statuses[to]?.label.toLowerCase() || ''}`}
          </button>
        </form>
      )}

      {!closed && (
        <div className="row wrap">
          <button type="button" className={`btn btn-sm ${mode === 'forward' ? 'btn-outline' : ''}`} onClick={() => setMode(mode === 'forward' ? null : 'forward')}>
            <ArrowRightLeft size={15} strokeWidth={STROKE} /> Forward
          </button>
          <button type="button" className={`btn btn-sm ${mode === 'merge' ? 'btn-outline' : ''}`} onClick={() => setMode(mode === 'merge' ? null : 'merge')}>
            <Merge size={15} strokeWidth={STROKE} /> Merge duplicate
          </button>
        </div>
      )}

      {mode === 'forward' && (
        <form className="stack" onSubmit={forward}>
          <div className="field">
            <label className="label" htmlFor="fw-to">
              Send to council
            </label>
            <select id="fw-to" className="select" value={forwardTo} onChange={(e) => setForwardTo(e.target.value)}>
              <option value="">Choose a council</option>
              {meta.authorities
                .filter((a) => a.id !== r.authority)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="fw-note">
              Note <span className="opt">(optional)</span>
            </label>
            <input id="fw-note" className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. This road is under MBPJ." />
          </div>
          <button className="btn btn-primary" disabled={busy || !forwardTo}>
            Forward report
          </button>
          <p className="hint">You will no longer be able to update this report after forwarding it.</p>
        </form>
      )}

      {mode === 'merge' && (
        <form className="stack" onSubmit={merge}>
          <p className="small muted">
            Merge this report into the main one. It will be closed, and its reporter and supporters will be added as "Me too" on the main report.
          </p>
          {nearby === null ? (
            <Spinner />
          ) : nearby.length > 0 ? (
            <div className="stack" style={{ gap: 6 }} role="radiogroup" aria-label="Main report">
              {nearby.map((n) => (
                <label key={n.id} className="row card" style={{ padding: 10, cursor: 'pointer' }}>
                  <input type="radio" name="merge" value={n.id} checked={String(n.id) === mergeInto} onChange={(e) => setMergeInto(e.target.value)} />
                  <span className="grow">
                    <span className="small strong">
                      #{n.id} {n.title}
                    </span>
                    <br />
                    <span className="tiny muted">
                      {distance(n.distance)} away · {n.metoo} Me too
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="hint">No open reports nearby. Enter a report number instead.</p>
          )}
          <div className="field">
            <label className="label" htmlFor="merge-id">
              Main report number
            </label>
            <input id="merge-id" className="input" inputMode="numeric" value={mergeInto} onChange={(e) => setMergeInto(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 12" />
          </div>
          <button className="btn btn-primary" disabled={busy || !mergeInto || Number(mergeInto) === r.id}>
            Merge into #{mergeInto || '...'}
          </button>
        </form>
      )}
    </section>
  );
}
