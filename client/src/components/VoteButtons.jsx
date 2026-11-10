import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Users } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STROKE } from '../icons.jsx';
import { Confirm, useToast } from './ui.jsx';

/** Shared "Me too" / "Hoax" voting, used by VoteButtons and the feed. */
export function useVote(report, onChange) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [askHoax, setAskHoax] = useState(false);
  const closed = Boolean(report.mergedInto) || ['resolved', 'rejected'].includes(report.status);
  const disabledReason = report.isMine
    ? 'You posted this report'
    : closed
      ? 'This report is closed'
      : user?.role === 'official'
        ? 'Staff do not vote'
        : null;

  async function vote(type, confirmed = false) {
    if (!user) return navigate('/login', { state: { from: `/reports/${report.id}` } });
    if (!user.verified) return navigate('/verify');
    if (disabledReason || busy) return undefined;
    // A hoax flag can alert the council, so ask first. Taking it back needs no confirm.
    if (type === 'hoax' && report.myVote !== 'hoax' && !confirmed) return setAskHoax(true);
    setBusy(true);
    try {
      const { report: updated } = await api(`/reports/${report.id}/vote`, { method: 'POST', body: { type } });
      onChange?.(updated);
      if (updated.myVote === 'metoo' && type === 'metoo') toast.ok('Thanks. Your "Me too" helps the council prioritise this.');
      else if (updated.myVote === 'hoax' && type === 'hoax') toast.ok('Flag noted. Staff check reports with many hoax flags.');
      else toast.ok('Vote removed.');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  const hoaxConfirm = askHoax && (
    <Confirm
      title="Flag as hoax?"
      message="Only flag reports that look false, such as a fake photo or a problem that is not there. Reports with many flags are sent to the council to check."
      confirmLabel="Flag as hoax"
      danger
      busy={busy}
      onConfirm={() => {
        setAskHoax(false);
        vote('hoax', true);
      }}
      onClose={() => setAskHoax(false)}
    />
  );

  return { vote, busy, disabledReason, hoaxConfirm };
}

// "Me too" and "Hoax". Pressing the same button again takes the vote back.
export default function VoteButtons({ report, onChange }) {
  const { vote, busy, disabledReason, hoaxConfirm } = useVote(report, onChange);

  return (
    <div className="stack" style={{ gap: 6 }}>
      {hoaxConfirm}
      <div className="votes">
        <button
          type="button"
          className={`vote ${report.myVote === 'metoo' ? 'on' : ''}`}
          onClick={() => vote('metoo')}
          disabled={busy || Boolean(disabledReason)}
          aria-pressed={report.myVote === 'metoo'}
          title="I see this problem too"
        >
          <Users size={17} strokeWidth={STROKE} /> Me too <span className="count">{report.metoo}</span>
        </button>
        <button
          type="button"
          className={`vote hoax ${report.myVote === 'hoax' ? 'on' : ''}`}
          onClick={() => vote('hoax')}
          disabled={busy || Boolean(disabledReason)}
          aria-pressed={report.myVote === 'hoax'}
          title="This report looks false or misleading"
        >
          <ShieldAlert size={17} strokeWidth={STROKE} /> Hoax <span className="count">{report.hoax}</span>
        </button>
      </div>
      {disabledReason && <span className="hint">{disabledReason}.</span>}
      {!disabledReason && report.myVote && <span className="hint">Tap again to take your vote back.</span>}
    </div>
  );
}
