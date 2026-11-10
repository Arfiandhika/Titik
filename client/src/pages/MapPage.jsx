import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleCheck, CircleDot, Crosshair, Layers, LayoutGrid, List, Map as MapIcon, Search, User, X, ChevronRight, Inbox } from 'lucide-react';
import { api, qs } from '../api.js';
import { useMeta } from '../meta.jsx';
import { useAuth } from '../auth.jsx';
import { getPosition } from '../utils.js';
import { CATEGORY_ICONS, STROKE } from '../icons.jsx';
import { ReportMap } from '../components/GoogleMap.jsx';
import ReportCard from '../components/ReportCard.jsx';
import { Dropdown, Empty, Spinner, useToast } from '../components/ui.jsx';

// Rejected reports never show on the public map; owners still see theirs under "Mine".
const VIEWS = {
  open: { label: 'Open', status: ['submitted', 'under_review', 'in_progress'], icon: CircleDot, hint: 'Still waiting to be fixed' },
  resolved: { label: 'Fixed', status: ['resolved'], icon: CircleCheck, hint: 'Resolved by the council' },
  all: { label: 'All', status: ['submitted', 'under_review', 'in_progress', 'resolved'], icon: Layers, hint: 'Open and fixed' },
  mine: { label: 'Mine', status: [], mine: true, icon: User, hint: 'Every report you posted' },
};
const MAP_LIMIT = 500; // server maximum per request

const PHONE = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;

// Interactive map of reports with filters.
export default function MapPage() {
  const { meta } = useMeta();
  const toast = useToast();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const canMine = user?.role === 'resident';
  const views = Object.entries(VIEWS).filter(([k]) => k !== 'mine' || canMine);
  const [view, setView] = useState(() => {
    const v = params.get('view');
    return VIEWS[v] && (v !== 'mine' || canMine) ? v : 'open';
  });
  // /map?report=ID (from a post on the home feed) selects that report once it loads.
  const pending = useRef(Number(params.get('report')) || null);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [me, setMe] = useState(null);
  const [focus, setFocus] = useState(null);
  const [locating, setLocating] = useState(false);
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctrl = new AbortController();
    const v = VIEWS[view];
    const query_ = { status: v.status, mine: v.mine ? 1 : undefined, category: cats, q: query, limit: MAP_LIMIT, ...(me ? { lat: me.lat, lng: me.lng, sort: 'near' } : {}) };
    api(`/reports${qs(query_)}`, { signal: ctrl.signal })
      .then(({ reports }) => setReports(reports))
      .catch((e) => e.name !== 'AbortError' && toast.error(e));
    return () => ctrl.abort();
  }, [view, cats, query, me, toast]);

  const selected = useMemo(() => reports?.find((r) => r.id === selectedId), [reports, selectedId]);

  const select = useCallback(
    (id, { pan = false } = {}) => {
      setSelectedId(id);
      const r = reports?.find((x) => x.id === id);
      if (r && pan) setFocus({ lat: r.lat, lng: r.lng, zoom: 15 });
    },
    [reports],
  );

  async function nearMe() {
    setLocating(true);
    try {
      const p = await getPosition();
      setMe(p);
      setFocus({ lat: p.lat, lng: p.lng, zoom: 15 });
    } catch (err) {
      toast.error(err);
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    if (!pending.current || !reports) return;
    const id = pending.current;
    pending.current = null;
    if (reports.some((r) => r.id === id)) select(id, { pan: true });
  }, [reports, select]);

  // Leaving "Mine" if the user signs out.
  useEffect(() => {
    if (view === 'mine' && !canMine) setView('open');
  }, [view, canMine]);

  return (
    <div className={`map-page ${showMap ? 'show-map' : ''}`}>
      <aside className="map-side">
        <div className="map-side-head">
          <div className="row" style={{ gap: 8 }}>
            <div className="input-group grow">
              <label htmlFor="map-search" className="sr-only">
                Search reports
              </label>
              <input id="map-search" className="input" placeholder="Search by title or street" value={q} onChange={(e) => setQ(e.target.value)} />
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
            <button type="button" className="btn show-phone" onClick={() => setShowMap(true)}>
              <MapIcon size={16} strokeWidth={STROKE} /> Map
            </button>
          </div>
          <div className="map-filters">
            <Dropdown
              label="Show"
              value={view}
              onChange={setView}
              options={views.map(([k, v]) => ({ value: k, label: v.label, icon: v.icon, hint: v.hint }))}
            />
            <Dropdown
              label="Category"
              align="right"
              value={cats[0] || ''}
              onChange={(v) => setCats(v ? [v] : [])}
              options={[
                { value: '', label: 'All categories', icon: LayoutGrid },
                ...meta.categories.map((c) => ({ value: c.id, label: c.label, icon: CATEGORY_ICONS[c.id], color: c.color })),
              ]}
            />
            <button
              type="button"
              className={`btn icon-btn-lg ${me ? 'active' : ''}`}
              onClick={me ? () => setMe(null) : nearMe}
              disabled={locating}
              aria-label={me ? 'Stop sorting by distance' : 'Near me'}
              title={me ? 'Clear "Near me"' : 'Near me'}
            >
              {locating ? <Spinner size={16} /> : me ? <X size={16} strokeWidth={STROKE} /> : <Crosshair size={16} strokeWidth={STROKE} />}
            </button>
          </div>
        </div>
        <div className="map-side-list">
          {reports === null ? (
            <div className="stack">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 120 }} />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <Empty icon={Inbox} title="Nothing here" action={(cats.length || q) && <button className="btn btn-sm" onClick={() => { setCats([]); setQ(''); }}>Clear filters</button>}>
              No reports match these filters.
            </Empty>
          ) : (
            <div className="report-list">
              {reports.map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  selected={r.id === selectedId}
                  onClick={() => {
                    select(r.id, { pan: true });
                    setShowMap(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="map-wrap" aria-label="Map of reports">
        <div className="map-canvas">
          <ReportMap reports={reports || []} selectedId={selectedId} onSelect={(id) => select(id)} me={me} focus={focus} zoom={PHONE ? 11 : 12} ringStatus={view === 'mine'} />
        </div>
        {selected && (
          <div className="map-float bottom">
            <div className="map-card">
              <ReportCard report={selected} />
              <Link to={`/reports/${selected.id}`} className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
                Open report <ChevronRight size={16} strokeWidth={STROKE} />
              </Link>
            </div>
          </div>
        )}
      </section>

      {showMap && (
        <div className="map-float show-phone" style={{ top: 12, left: 12, zIndex: 7 }}>
          <button type="button" className="btn btn-sm locate-btn" onClick={() => setShowMap(false)}>
            <List size={16} strokeWidth={STROKE} /> List
          </button>
        </div>
      )}
    </div>
  );
}
