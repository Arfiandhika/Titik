import { Link } from 'react-router-dom';
import { MessageCircle, ShieldAlert, Users, MapPin } from 'lucide-react';
import { CategoryLabel, StatusBadge } from './ui.jsx';
import { STROKE } from '../icons.jsx';
import { distance, timeAgo } from '../utils.js';

export default function ReportCard({ report: r, selected, onClick, showAuthority }) {
  const body = (
    <>
      <img className="thumb" src={r.photoUrl} alt="" loading="lazy" />
      <div style={{ minWidth: 0 }}>
        <div className="row between">
          <CategoryLabel category={r.category} />
          <StatusBadge status={r.status} />
        </div>
        <h3>{r.title}</h3>
        <div className="small muted ellipsis">{r.address || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`}</div>
        <div className="meta">
          <span title='"Me too" confirmations'>
            <Users size={14} strokeWidth={STROKE} /> {r.metoo}
          </span>
          <span title="Comments">
            <MessageCircle size={14} strokeWidth={STROKE} /> {r.commentCount}
          </span>
          {r.distance != null && (
            <span>
              <MapPin size={14} strokeWidth={STROKE} /> {distance(r.distance)}
            </span>
          )}
          <span>{timeAgo(r.createdAt)}</span>
          {showAuthority && <span>{r.authority || 'Unrouted'}</span>}
          {r.hoaxFlagged && (
            <span className="tag danger">
              <ShieldAlert size={12} strokeWidth={STROKE} /> Flagged
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`report-card ${selected ? 'selected' : ''}`} onClick={onClick} aria-pressed={selected}>
        {body}
      </button>
    );
  }
  return (
    <Link to={`/reports/${r.id}`} className="report-card">
      {body}
    </Link>
  );
}
