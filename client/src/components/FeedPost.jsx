import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, MessageCircle, Send, ShieldAlert, Users } from 'lucide-react';
import { Avatar, CategoryLabel, primeKeyboard, Sheet, StatusBadge, useToast } from './ui.jsx';
import Comments from './Comments.jsx';
import { useVote } from './VoteButtons.jsx';
import { STROKE } from '../icons.jsx';
import { distance, plural, timeAgo } from '../utils.js';

const I = (C, size = 24) => <C size={size} strokeWidth={STROKE} aria-hidden="true" />;

// Feed-style report post. Double-tap the photo to say "Me too".
export default function FeedPost({ report: r, onChange }) {
  const { vote, busy, disabledReason, hoaxConfirm } = useVote(r, onChange);
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [burst, setBurst] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const openComments = () => {
    primeKeyboard();
    setCommentsOpen(true);
  };
  const closeComments = useCallback(() => setCommentsOpen(false), []);
  const onCount = useCallback((n) => n !== r.commentCount && onChange?.({ ...r, commentCount: n }), [r, onChange]);
  const lastTap = useRef(0);
  const place = r.address || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;
  const link = `/reports/${r.id}`;
  const by = r.reporter;
  // Which map tab shows this report: yours are under "Mine"; rejected ones are not on the public map.
  const mapView = r.isMine ? 'mine' : r.status === 'resolved' ? 'resolved' : r.status === 'rejected' || r.mergedInto ? null : 'open';

  function onPhotoTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (disabledReason) return;
      setBurst((b) => b + 1);
      if (r.myVote !== 'metoo') vote('metoo');
    } else {
      lastTap.current = now;
    }
  }

  async function share() {
    const url = `${window.location.origin}${link}`;
    try {
      if (navigator.share) await navigator.share({ title: r.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.ok('Link copied.');
      }
    } catch {
      /* share sheet closed */
    }
  }

  return (
    <article className="post">
      <header className="post-head">
        {by ? (
          <Link to={`/users/${by.id}`} className="post-user">
            <Avatar user={by} />
          </Link>
        ) : (
          <Avatar user={by} />
        )}
        <div className="grow">
          {by ? (
            <Link to={`/users/${by.id}`} className="post-name ellipsis">
              {by.name}
            </Link>
          ) : (
            <span className="post-name">Resident</span>
          )}
          {mapView ? (
            <Link to={`/map?view=${mapView}&report=${r.id}`} className="tiny muted ellipsis post-place" title="Show on the map">
              <MapPin size={12} strokeWidth={STROKE} aria-hidden="true" /> {place}
            </Link>
          ) : (
            <div className="tiny muted ellipsis">
              <MapPin size={12} strokeWidth={STROKE} aria-hidden="true" /> {place}
            </div>
          )}
        </div>
        <StatusBadge status={r.status} />
      </header>

      <div className="post-photo" onClick={onPhotoTap} role="presentation">
        <img src={r.photoUrl} alt={r.title} loading="lazy" draggable="false" />
        {r.hoaxFlagged && (
          <span className="tag danger post-flag">
            <ShieldAlert size={12} strokeWidth={STROKE} /> Flagged
          </span>
        )}
        {burst > 0 && (
          <span key={burst} className="post-burst" aria-hidden="true">
            <Users size={72} strokeWidth={STROKE} />
          </span>
        )}
      </div>

      <div className="post-actions">
        <button
          type="button"
          className={`post-act ${r.myVote === 'metoo' ? 'on' : ''}`}
          onClick={() => vote('metoo')}
          disabled={busy || Boolean(disabledReason)}
          aria-pressed={r.myVote === 'metoo'}
          aria-label="Me too"
          title={disabledReason || 'Me too: I see this problem too'}
        >
          {I(Users)}
        </button>
        <button type="button" className="post-act" onClick={openComments} aria-label="Comment" title="Comment">
          {I(MessageCircle)}
        </button>
        <button type="button" className="post-act" onClick={share} aria-label="Share" title="Share">
          {I(Send)}
        </button>
        <button
          type="button"
          className={`post-act hoax ${r.myVote === 'hoax' ? 'on' : ''}`}
          onClick={() => vote('hoax')}
          disabled={busy || Boolean(disabledReason)}
          aria-pressed={r.myVote === 'hoax'}
          aria-label="Hoax"
          title={disabledReason || 'Hoax: this report looks false'}
        >
          {I(ShieldAlert)}
        </button>
      </div>

      <div className="post-body">
        <div className="strong small">
          {r.metoo} Me too
          {r.hoax > 0 && <span className="muted"> · {plural(r.hoax, 'hoax flag')}</span>}
        </div>
        <p className={`post-caption ${expanded ? 'open' : ''}`}>
          <Link to={link} className="strong">
            {r.title}
          </Link>
          {r.description && <> {r.description}</>}
        </p>
        {r.description && r.description.length > 110 && !expanded && (
          <button type="button" className="link-btn muted small" onClick={() => setExpanded(true)}>
            more
          </button>
        )}
        <button type="button" className="link-btn muted small" onClick={openComments}>
          {r.commentCount ? `View all ${plural(r.commentCount, 'comment')}` : 'Add a comment'}
        </button>
        <div className="row wrap tiny muted" style={{ gap: 8 }}>
          <CategoryLabel category={r.category} size={13} />
          <span>{timeAgo(r.createdAt)}</span>
          {r.distance != null && <span>{distance(r.distance)} away</span>}
        </div>
      </div>
      {hoaxConfirm}
      {commentsOpen && (
        <Sheet title="Comments" onClose={closeComments} className="comments-sheet">
          <Comments reportId={r.id} onCount={onCount} autoFocus inSheet />
        </Sheet>
      )}
    </article>
  );
}
