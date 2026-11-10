import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, History, Inbox, LayoutGrid, ListFilter, Search, Users, X } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { CategoryIcon, STATUS_ICONS, STROKE } from '../icons.jsx';
import FeedPost from '../components/FeedPost.jsx';
import { Dropdown, Empty, useToast } from '../components/ui.jsx';

const PAGE = 20;

// FR10 / FR14: browse and track reports as a photo feed. "Mine" is the resident's report history.
export default function ReportsPage() {
  const { user } = useAuth();
  const { meta } = useMeta();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'all';
  const status = params.get('status') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'new';
  const [q, setQ] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [limit, setLimit] = useState(PAGE);

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  useEffect(() => {
    const t = setTimeout(() => set('q', q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = new AbortController();
    const query = {
      status,
      category,
      sort,
      q: params.get('q'),
      limit,
      mine: tab === 'mine' ? 1 : undefined,
      supported: tab === 'supported' ? 1 : undefined,
    };
    if (tab !== 'all' && !user) return undefined;
    api(`/reports${qs(query)}`, { signal: ctrl.signal })
      .then(setData)
      .catch((e) => e.name !== 'AbortError' && toast.error(e));
    return () => ctrl.abort();
  }, [tab, status, category, sort, params, limit, user, toast]);

  // Keep the feed in place after a vote instead of reloading it.
  const update = (u) => setData((d) => ({ ...d, reports: d.reports.map((r) => (r.id === u.id ? { ...r, ...u } : r)) }));

  const tabs = [
    { id: 'all', label: 'All reports' },
    ...(user && user.role === 'resident'
      ? [
          { id: 'mine', label: 'My reports' },
          { id: 'supported', label: 'Me too' },
        ]
      : []),
  ];

  return (
    <div className="page feed">
      <h1 className="sr-only">Reports</h1>

      {/* Category "stories": tap one to filter the feed (FR5 / FR14) */}
      <div className="stories" role="tablist" aria-label="Category">
        <button type="button" role="tab" aria-selected={!category} className={`story ${!category ? 'active' : ''}`} onClick={() => set('category', '')}>
          <span className="story-ring">
            <span className="story-ic">
              <LayoutGrid size={22} strokeWidth={STROKE} aria-hidden="true" />
            </span>
          </span>
          <span className="story-label">All</span>
        </button>
        {meta.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={`story ${category === c.id ? 'active' : ''}`}
            style={{ '--c': c.color }}
            onClick={() => set('category', category === c.id ? '' : c.id)}
          >
            <span className="story-ring">
              <span className="story-ic">
                <CategoryIcon id={c.id} size={22} />
              </span>
            </span>
            <span className="story-label">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="stack" style={{ marginBottom: 18 }}>
        {tabs.length > 1 && (
          <div className="seg" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => set('tab', t.id === 'all' ? '' : t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid filters feed-filters">
          <div className="input-group">
            <label htmlFor="rq" className="sr-only">
              Search
            </label>
            <input id="rq" className="input" placeholder="Search by title or street" value={q} onChange={(e) => setQ(e.target.value)} />
            {q ? (
              <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="Clear search">
                <X size={17} strokeWidth={STROKE} />
              </button>
            ) : (
              <span className="icon-btn" aria-hidden="true">
                <Search size={17} strokeWidth={STROKE} />
              </span>
            )}
          </div>
          <Dropdown
            label="Status"
            value={status}
            onChange={(v) => set('status', v)}
            options={[
              { value: '', label: 'Any status', icon: ListFilter, hint: 'Show every report' },
              ...meta.statuses.map((s) => ({ value: s.id, label: s.label, icon: STATUS_ICONS[s.id], className: `st-${s.id}` })),
            ]}
          />
          <Dropdown
            label="Sort by"
            align="right"
            value={sort}
            onChange={(v) => set('sort', v === 'new' ? '' : v)}
            options={[
              { value: 'new', label: 'Newest first', icon: ArrowDownWideNarrow, hint: 'Latest reports on top' },
              { value: 'popular', label: 'Most "Me too"', icon: Users, hint: 'Most confirmed by neighbours' },
              { value: 'oldest', label: 'Oldest first', icon: History, hint: 'Waiting the longest' },
            ]}
          />
        </div>
      </div>

      {data === null ? (
        <div className="feed-list">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton post-skeleton" />
          ))}
        </div>
      ) : data.reports.length === 0 ? (
        <Empty
          icon={Inbox}
          title={tab === 'mine' ? 'You have not reported anything yet' : tab === 'supported' ? 'No "Me too" yet' : 'No reports found'}
        >
          {tab === 'supported' ? 'Say "Me too" on reports you also see, and they will show up here.' : tab === 'mine' ? 'Tap + at the bottom right to report a problem.' : 'Try other filters.'}
        </Empty>
      ) : (
        <>
          <div className="feed-list">
            {data.reports.map((r) => (
              <FeedPost key={r.id} report={r} onChange={update} />
            ))}
          </div>
          {data.total > data.reports.length && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
              <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
