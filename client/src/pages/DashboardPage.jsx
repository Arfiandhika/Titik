import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, ShieldAlert, Clock, CalendarPlus, Search, X, CircleDot } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { CategoryIcon, STROKE } from '../icons.jsx';
import { timeAgo } from '../utils.js';
import { Empty, Loading, StatusBadge, useToast } from '../components/ui.jsx';

const QUEUES = [
  { id: 'new', label: 'New', status: ['submitted'] },
  { id: 'review', label: 'Under review', status: ['under_review'] },
  { id: 'progress', label: 'In progress', status: ['in_progress'] },
  { id: 'flagged', label: 'Flagged', status: ['submitted', 'under_review', 'in_progress'], flagged: 1 },
  { id: 'closed', label: 'Closed', status: ['resolved', 'rejected'] },
  { id: 'all', label: 'All', status: [] },
];

// FR17: council dashboard, scoped to the signed-in officer's council (plus unrouted reports).
export default function DashboardPage() {
  const { user } = useAuth();
  const { meta, category: cats, status: statuses, authority } = useMeta();
  const toast = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState('new');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api('/stats?area=mine').then(setStats).catch((e) => toast.error(e));
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctrl = new AbortController();
    const def = QUEUES.find((x) => x.id === queue);
    setRows(null);
    api(`/reports${qs({ area: 'mine', status: def.status, flagged: def.flagged, category, q: query, sort: def.id === 'closed' || def.id === 'all' ? 'new' : 'oldest' })}`, {
      signal: ctrl.signal,
    })
      .then(({ reports }) => setRows(reports))
      .catch((e) => e.name !== 'AbortError' && toast.error(e));
    return () => ctrl.abort();
  }, [queue, category, query, toast]);

  if (!stats) return <Loading />;
  const maxCat = Math.max(1, ...Object.values(stats.byCategory));
  const maxStatus = Math.max(1, ...Object.values(stats.byStatus));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{authority[user.authority]?.name}</h1>
          <p>Reports in your area, plus reports outside every council area.</p>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <Stat icon={CircleDot} label="Open reports" value={stats.open} />
        <Stat icon={CalendarPlus} label="New this week" value={stats.newThisWeek} />
        <Stat icon={ShieldAlert} label="Flagged as hoax" value={stats.flagged} />
        <Stat icon={Clock} label="Average days to fix" value={stats.avgDaysToResolve ?? '-'} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        <section className="card">
          <h2 style={{ marginBottom: 14 }}>By status</h2>
          <div className="bars">
            {meta.statuses.map((s) => (
              <div key={s.id} className={`bar-row st-${s.id}`}>
                <span className="ellipsis">{s.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(stats.byStatus[s.id] / maxStatus) * 100}%`, '--c': 'var(--st)' }} />
                </div>
                <span className="muted" style={{ textAlign: 'right' }}>
                  {stats.byStatus[s.id]}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2 style={{ marginBottom: 14 }}>By category</h2>
          <div className="bars">
            {meta.categories
              .filter((c) => stats.byCategory[c.id] > 0)
              .sort((a, b) => stats.byCategory[b.id] - stats.byCategory[a.id])
              .map((c) => (
                <div key={c.id} className="bar-row">
                  <span className="row ellipsis" style={{ gap: 6 }}>
                    <span style={{ color: c.color, display: 'inline-flex' }}>
                      <CategoryIcon id={c.id} size={14} />
                    </span>
                    {c.label}
                  </span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(stats.byCategory[c.id] / maxCat) * 100}%`, '--c': c.color }} />
                  </div>
                  <span className="muted" style={{ textAlign: 'right' }}>
                    {stats.byCategory[c.id]}
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>

      <section className="card flush">
        <div style={{ padding: 16 }} className="stack">
          <div className="row between wrap">
            <h2>Work queue</h2>
            <div className="row wrap">
              <div className="input-group" style={{ width: 220 }}>
                <label htmlFor="dq" className="sr-only">
                  Search
                </label>
                <input id="dq" className="input" style={{ minHeight: 38 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
                {q ? (
                  <button type="button" className="icon-btn sm" style={{ top: 3 }} onClick={() => setQ('')} aria-label="Clear search">
                    <X size={16} strokeWidth={STROKE} />
                  </button>
                ) : (
                  <span className="icon-btn sm" style={{ top: 3 }} aria-hidden="true">
                    <Search size={16} strokeWidth={STROKE} />
                  </span>
                )}
              </div>
              <select className="select" style={{ width: 'auto', minHeight: 38 }} aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {meta.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="chips scroll" role="tablist">
            {QUEUES.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={queue === x.id} className={`chip ${queue === x.id ? 'active' : ''}`} onClick={() => setQueue(x.id)}>
                {x.label}
                {x.id === 'new' && stats.byStatus.submitted > 0 && <span className="tag">{stats.byStatus.submitted}</span>}
                {x.id === 'flagged' && stats.flagged > 0 && <span className="tag danger">{stats.flagged}</span>}
              </button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={Inbox} title="Queue is clear">
            No reports in this list.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Report</th>
                  <th className="hide-phone">Category</th>
                  <th>Status</th>
                  <th className="hide-phone">Me too</th>
                  <th className="hide-phone">Reported</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/reports/${r.id}`)}>
                    <td className="muted">{r.id}</td>
                    <td style={{ minWidth: 180 }}>
                      <a href={`/reports/${r.id}`} onClick={(e) => e.preventDefault()} style={{ color: 'var(--text)' }} className="strong">
                        {r.title}
                      </a>
                      <div className="tiny muted ellipsis" style={{ maxWidth: 320 }}>
                        {r.address || 'No address'}
                      </div>
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        {!r.authority && <span className="tag warn">Unrouted</span>}
                        {r.hoaxFlagged && <span className="tag danger">Hoax flag</span>}
                      </div>
                    </td>
                    <td className="hide-phone">
                      <span className="row" style={{ gap: 6 }}>
                        <span style={{ color: cats[r.category]?.color, display: 'inline-flex' }}>
                          <CategoryIcon id={r.category} size={15} />
                        </span>
                        {cats[r.category]?.label}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="hide-phone">{r.metoo}</td>
                    <td className="hide-phone muted">{timeAgo(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="hint" style={{ marginTop: 10 }}>
        Oldest first in open queues, so long-waiting reports are handled first. {statuses.submitted.label} reports can still be edited by residents.
      </p>
    </div>
  );
}

function Stat({ icon: Ic, label, value }) {
  return (
    <div className="stat">
      <span className="k">
        <Ic size={15} strokeWidth={STROKE} /> {label}
      </span>
      <span className="v">{value}</span>
    </div>
  );
}
