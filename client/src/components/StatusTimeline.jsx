import { ArrowRightLeft, Merge } from 'lucide-react';
import { useMeta } from '../meta.jsx';
import { Icon, StatusIcon } from '../icons.jsx';
import { dateTime } from '../utils.js';

const FLOW = ['submitted', 'under_review', 'in_progress', 'resolved'];

// FR10: where the report is in its journey (visibility of system status).
export function StatusSteps({ status }) {
  const { status: statuses } = useMeta();
  const at = FLOW.indexOf(status);
  return (
    <div className={`steps ${status === 'rejected' ? 'rejected' : ''}`} aria-label={`Status: ${statuses?.[status]?.label}`}>
      {FLOW.map((s, i) => (
        <div key={s} className={`step ${at >= i ? 'done' : ''}`}>
          <div className="bar" />
          <span>{statuses?.[s]?.label}</span>
        </div>
      ))}
    </div>
  );
}

// DR3: full history of status changes, forwards and merges.
export default function StatusTimeline({ history }) {
  const { status: statuses } = useMeta();
  return (
    <ol className="timeline">
      {history.map((h) => {
        let title;
        let dot;
        let cls = '';
        if (h.kind === 'forward') {
          title = `Forwarded from ${h.fromAuthority} to ${h.toAuthority}`;
          dot = <Icon as={ArrowRightLeft} size={13} />;
        } else if (h.kind === 'merge') {
          title = h.note || 'Merged';
          dot = <Icon as={Merge} size={13} />;
        } else if (h.fromStatus && h.fromStatus === h.toStatus) {
          title = h.note || 'Updated';
          dot = <StatusIcon id={h.toStatus} size={13} />;
          cls = `st-${h.toStatus}`;
        } else {
          title = h.toStatus === 'submitted' ? 'Report submitted' : `Marked ${statuses?.[h.toStatus]?.label?.toLowerCase()}`;
          dot = <StatusIcon id={h.toStatus} size={13} />;
          cls = `st-${h.toStatus}`;
        }
        const showNote = h.note && !(h.kind === 'merge' || (h.fromStatus && h.fromStatus === h.toStatus));
        return (
          <li key={h.id} className={cls}>
            <span className="tl-dot">{dot}</span>
            <div className="tl-title">{title}</div>
            <div className="tiny muted">
              {dateTime(h.createdAt)}
              {h.actor && ` · ${h.actor.name}${h.actor.role === 'official' ? ` (${h.actor.authority})` : ''}`}
            </div>
            {showNote && <div className="tl-note">{h.note}</div>}
          </li>
        );
      })}
    </ol>
  );
}
