import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { BADGE_ICONS, Icon } from '../icons.jsx';
import { Avatar, Empty, Loading, useToast } from './ui.jsx';

// Top contributors by points earned (redemptions don't lower your rank).
export default function Leaderboard({ title = 'Leaderboard', as: H = 'h1' }) {
  const { user } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api(`/leaderboard?period=${period}`).then(setData).catch((e) => toast.error(e));
  }, [period, toast, user?.id]);

  return (
    <section>
      <div className="page-head">
        <div>
          <H>{title}</H>
          <p>Residents who did the most for their neighbourhood.</p>
        </div>
        <div className="seg" role="tablist">
          {[
            ['all', 'All time'],
            ['month', 'This month'],
          ].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={period === k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <Loading />
      ) : data.leaders.length === 0 ? (
        <Empty icon={Trophy} title="No points yet this month">
          Be the first: tap + on the home page to report a problem.
        </Empty>
      ) : (
        <div className="card flush">
          {data.leaders.map((l) => (
            <Link key={l.user.id} to={`/users/${l.user.id}`} className={`leader ${l.isMe ? 'me' : ''}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
              <span className={`rank ${l.rank <= 3 ? 'top' : ''}`}>{l.rank}</span>
              <Avatar user={l.user} />
              <span style={{ minWidth: 0 }}>
                <span className="strong">
                  {l.user.name}
                  {l.isMe && <span className="muted small"> (you)</span>}
                </span>
                <span className="row tiny muted" style={{ gap: 6 }}>
                  {l.reports} reports
                  {l.badges.slice(0, 3).map((b) => (
                    <span key={b.id} title={b.label} className="lb-badge" style={{ '--c': b.color }}>
                      <Icon as={BADGE_ICONS[b.id]} size={13} />
                    </span>
                  ))}
                </span>
              </span>
              <span className="plus">{l.points} pts</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
