import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Copy, Ticket } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { BADGE_ICONS, Icon, STROKE } from '../icons.jsx';
import { timeAgo } from '../utils.js';
import { Empty, Loading, Modal, Confirm, useToast } from '../components/ui.jsx';

// FR13: contribution points, badges and rewards.
const HISTORY_PREVIEW = 5; // latest entries shown before "Show all"

export default function RewardsPage() {
  const [showAll, setShowAll] = useState(false);
  const [showAllCodes, setShowAllCodes] = useState(false);
  const { user, refresh } = useAuth();
  const { meta } = useMeta();
  const toast = useToast();
  const [points, setPoints] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/points').then(setPoints).catch((e) => toast.error(e));
    api('/rewards').then(({ rewards }) => setRewards(rewards)).catch((e) => toast.error(e));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function redeem(reward) {
    setBusy(true);
    try {
      const res = await api(`/rewards/${reward.id}/redeem`, { method: 'POST' });
      setConfirm(null);
      setCode({ reward, code: res.code });
      refresh();
      load();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  if (!points || !rewards) return <Loading />;
  const isResident = user.role === 'resident';
  const earned = new Set(points.badges.map((b) => b.id));

  return (
    <div className="page medium">
      <div className="page-head">
        <div>
          <h1>Points and rewards</h1>
          <p>Thanks for looking after your neighbourhood.</p>
        </div>
      </div>

      <div className="stack lg">
        <section className="card points-hero">
          <div>
            <div className="small muted">Your balance</div>
            <div className="points-big">{points.balance}</div>
            <div className="small muted">points</div>
          </div>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>+{meta.points.REPORT} for each report you post</li>
            <li>+{meta.points.METOO_ACCEPTED} for each "Me too" on a report the council accepts</li>
            <li>{meta.points.REJECTED} if your report is rejected</li>
          </ul>
        </section>

        {!user.verified && (
          <div className="notice warn small">
            <span>
              <Link to="/verify">Verify your account</Link> to redeem rewards.
            </span>
          </div>
        )}

        <section>
          <h2 style={{ marginBottom: 12 }}>Rewards</h2>
          <div className="grid cols-2">
            {rewards.map((w) => {
              const pct = Math.min(100, (points.balance / w.cost) * 100);
              const can = isResident && user.verified && points.balance >= w.cost && w.stock > 0;
              return (
                <div key={w.id} className="card reward">
                  <div className="row between">
                    <h3>{w.name}</h3>
                    <span className="cost">{w.cost} pts</span>
                  </div>
                  <p className="small muted">{w.description}</p>
                  <div className="progress" aria-label={`${Math.round(pct)}% of the points needed`}>
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <div className="row between">
                    <span className="tiny muted">
                      {w.stock > 0 ? `${w.stock} left` : 'Out of stock'}
                      {points.balance < w.cost && ` · ${w.cost - points.balance} more points needed`}
                    </span>
                    <button type="button" className="btn btn-sm btn-primary" disabled={!can} onClick={() => setConfirm(w)}>
                      Redeem
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {!isResident && <p className="hint" style={{ marginTop: 8 }}>Rewards are for resident accounts.</p>}
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 12 }}>Badges</h2>
          <div className="badges">
            {meta.badges.map((b) => (
              <span key={b.id} className={`badge-pill ${earned.has(b.id) ? '' : 'locked'}`} title={b.description}>
                <Icon as={BADGE_ICONS[b.id]} size={15} /> {b.label}
              </span>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>Greyed-out badges are not earned yet. Hover or long-press to see how to earn them.</p>
        </section>

        {points.redemptions.length > 0 && (
          <section className="card">
            <h2 style={{ marginBottom: 8 }}>Your codes</h2>
            <ul className="ledger">
              {(showAllCodes ? points.redemptions : points.redemptions.slice(0, HISTORY_PREVIEW)).map((d) => (
                <li key={d.id}>
                  <span>
                    {d.name}
                    <br />
                    <span className="tiny muted">{timeAgo(d.createdAt)}</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <code>{d.code}</code>
                    <CopyButton text={d.code} />
                  </span>
                </li>
              ))}
            </ul>
            {points.redemptions.length > HISTORY_PREVIEW && (
              <button type="button" className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setShowAllCodes((v) => !v)}>
                {showAllCodes ? 'Show less' : `Show all ${points.redemptions.length}`}
              </button>
            )}
          </section>
        )}

        <section className="card">
          <h2 style={{ marginBottom: 8 }}>History</h2>
          {points.history.length === 0 ? (
            <Empty icon={Gift} title="No points yet">
              Tap + on the home page to report a problem and earn your first {meta.points.REPORT} points.
            </Empty>
          ) : (
            <ul className="ledger">
              {(showAll ? points.history : points.history.slice(0, HISTORY_PREVIEW)).map((p) => (
                <li key={p.id}>
                  <span style={{ minWidth: 0 }}>
                    {p.reason}
                    {p.reportTitle && (
                      <>
                        {': '}
                        <Link to={`/reports/${p.reportId}`}>{p.reportTitle}</Link>
                      </>
                    )}
                    <br />
                    <span className="tiny muted">{timeAgo(p.createdAt)}</span>
                  </span>
                  <span className={p.amount >= 0 ? 'plus' : 'minus'}>
                    {p.amount >= 0 ? '+' : ''}
                    {p.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {points.history.length > HISTORY_PREVIEW && (
            <button type="button" className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : `Show all ${points.history.length}`}
            </button>
          )}
        </section>
      </div>

      {confirm && (
        <Confirm
          title={`Redeem ${confirm.name}?`}
          message={`This uses ${confirm.cost} of your ${points.balance} points. You will have ${points.balance - confirm.cost} left.`}
          confirmLabel={`Redeem for ${confirm.cost} pts`}
          busy={busy}
          onConfirm={() => redeem(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
      {code && (
        <Modal
          title="Reward redeemed"
          onClose={() => setCode(null)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setCode(null)}>
              Done
            </button>
          }
        >
          <div className="stack">
            <p className="muted">Show this code to claim "{code.reward.name}". It is also saved under Your codes.</p>
            <div className="code-box">{code.code}</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <CopyButton text={code.code} label="Copy code" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CopyButton({ text, label }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={label ? 'btn btn-sm' : 'icon-btn sm'}
      aria-label="Copy code"
      onClick={() =>
        navigator.clipboard
          ?.writeText(text)
          .then(() => toast.ok('Copied.'))
          .catch(() => {})
      }
    >
      {label ? <Ticket size={15} strokeWidth={STROKE} /> : <Copy size={15} strokeWidth={STROKE} />}
      {label}
    </button>
  );
}
