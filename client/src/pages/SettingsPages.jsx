import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Info, KeyRound, Mail, MessageSquare, Send } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { STROKE } from '../icons.jsx';
import { timeAgo } from '../utils.js';
import { Spinner, useToast } from '../components/ui.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import { FormError, PasswordInput } from './AuthPages.jsx';

// Sub-pages opened from the Profile page: Leaderboard, Security, Customer support.

function BackToProfile() {
  const navigate = useNavigate();
  return (
    <button type="button" className="back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/profile'))}>
      <ChevronLeft size={16} strokeWidth={STROKE} /> Profile
    </button>
  );
}

function DevCode({ code }) {
  if (!code) return null;
  return (
    <div className="notice small">
      <Info size={16} strokeWidth={STROKE} />
      <span>
        Prototype: no email or SMS service is connected, so here is your code: <strong>{code}</strong>
      </span>
    </div>
  );
}

// FR13
export function LeaderboardPage() {
  return (
    <div className="page narrow">
      <BackToProfile />
      <Leaderboard />
    </div>
  );
}

// ---------- Security: password, email, forgot password ----------
export function SecurityPage() {
  const { user } = useAuth();
  return (
    <div className="page narrow">
      <BackToProfile />
      <div className="page-head">
        <div>
          <h1>Security</h1>
          <p>Keep your account safe.</p>
        </div>
      </div>
      <div className="stack lg">
        <PasswordCard />
        <EmailCard />
        <section className="card">
          <h2 className="card-title" style={{ justifyContent: 'flex-start' }}>
            <KeyRound size={18} strokeWidth={STROKE} /> Forgot password
          </h2>
          <p className="small muted" style={{ marginBottom: 14 }}>
            Don't remember your current password? We will send a code to {user.email || user.phone} so you can set a new one.
          </p>
          <Link to="/forgot" state={{ identifier: user.email || user.phone, back: '/profile/security' }} className="btn">
            Reset with a code
          </Link>
        </section>
      </div>
    </div>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setPw((p) => ({ ...p, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setError(null);
    if (pw.next !== pw.confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api('/auth/me', { method: 'PATCH', body: { currentPassword: pw.current, newPassword: pw.next } });
      setPw({ current: '', next: '', confirm: '' });
      toast.ok('Password changed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <section className="card">
      <h2 className="card-title" style={{ justifyContent: 'flex-start' }}>
        <KeyRound size={18} strokeWidth={STROKE} /> Change password
      </h2>
      <form className="stack" onSubmit={save}>
        <FormError>{error}</FormError>
        <div className="field">
          <label className="label" htmlFor="sp-cur">
            Current password
          </label>
          <PasswordInput id="sp-cur" value={pw.current} onChange={set('current')} autoComplete="current-password" />
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label className="label" htmlFor="sp-new">
              New password
            </label>
            <PasswordInput id="sp-new" value={pw.next} onChange={set('next')} autoComplete="new-password" />
            <span className="hint">At least 6 characters.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="sp-confirm">
              Repeat new password
            </label>
            <PasswordInput id="sp-confirm" value={pw.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy || pw.next.length < 6 || !pw.current}>
            {busy && <Spinner size={16} />} Change password
          </button>
        </div>
      </form>
    </section>
  );
}

function EmailCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState('form'); // form -> code
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function start(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api('/auth/email', { method: 'POST', body: { email, password } });
      setDevCode(res.devCode || null);
      setStep('code');
      setCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user: u } = await api('/auth/email/confirm', { method: 'POST', body: { code } });
      setUser(u);
      toast.ok('Email changed.');
      setStep('form');
      setEmail('');
      setPassword('');
      setDevCode(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title" style={{ justifyContent: 'flex-start' }}>
        <Mail size={18} strokeWidth={STROKE} /> {user.email ? 'Change email' : 'Add an email'}
      </h2>
      <p className="small muted" style={{ marginBottom: 14 }}>
        {user.email ? (
          <>
            Current email: <span className="strong">{user.email}</span>
          </>
        ) : (
          'You sign in with your mobile number. Add an email as a second way to sign in.'
        )}
      </p>
      {step === 'form' ? (
        <form className="stack" onSubmit={start}>
          <FormError>{error}</FormError>
          <div className="grid cols-2">
            <div className="field">
              <label className="label" htmlFor="se-email">
                New email
              </label>
              <input id="se-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="se-pw">
                Your password
              </label>
              <PasswordInput id="se-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={busy || !email || !password}>
              {busy && <Spinner size={16} />} Send code
            </button>
          </div>
        </form>
      ) : (
        <form className="stack" onSubmit={confirm}>
          <p className="small">
            We sent a 6-digit code to <span className="strong">{email.trim().toLowerCase()}</span>.
          </p>
          <DevCode code={devCode} />
          <FormError>{error}</FormError>
          <div className="field">
            <label className="label" htmlFor="se-code">
              Code
            </label>
            <input
              id="se-code"
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <div className="row between">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('form')}>
              Use another email
            </button>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={start} disabled={busy}>
                Send again
              </button>
              <button className="btn btn-primary" disabled={busy || code.length !== 6}>
                {busy && <Spinner size={16} />} Confirm
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------- Customer support: FAQ + contact form ----------
export function SupportPage() {
  const { meta } = useMeta();
  const toast = useToast();
  const topics = meta.supportTopics || [];
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const topicLabel = (id) => topics.find((t) => t.id === id)?.label || id;

  useEffect(() => {
    api('/support')
      .then((r) => setTickets(r.tickets))
      .catch(() => setTickets([]));
  }, []);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ticket } = await api('/support', { method: 'POST', body: { topic, message } });
      setTickets((t) => [ticket, ...(t || [])]);
      setTopic('');
      setMessage('');
      toast.ok('Message sent. We usually reply within 2 working days.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const faq = [
    ['Who fixes the problems I report?', 'Titik sends each report to the council that looks after that spot (for example DBKL or MBPJ). Council staff review it and update the status.'],
    ['What do the statuses mean?', 'Submitted: waiting for the council. Under review: the council is checking it. In progress: work has started. Resolved: fixed. Rejected: the council could not act on it, and the reason is shown on the report.'],
    ['How do I earn points?', `+${meta.points.REPORT} for each report, and +${meta.points.METOO_ACCEPTED} for each "Me too" on a report the council accepts. A rejected report takes ${Math.abs(meta.points.REJECTED)} points back.`],
    ['What does "Hoax" do?', `It flags a report that looks false. When ${meta.hoaxThreshold} or more people flag it, and they outnumber the "Me too" votes, council staff are alerted to check it.`],
    ['Why do I need to verify my account?', 'Verifying with a code stops fake accounts. You need it to post, vote, comment and redeem rewards.'],
  ];

  return (
    <div className="page narrow">
      <BackToProfile />
      <div className="page-head">
        <div>
          <h1>Customer support</h1>
          <p>Answers to common questions, or send us a message.</p>
        </div>
      </div>
      <div className="stack lg">
        <section className="card flush">
          {faq.map(([q, a]) => (
            <details key={q} className="faq">
              <summary>{q}</summary>
              <p className="small muted">{a}</p>
            </details>
          ))}
        </section>

        <section className="card">
          <h2 className="card-title" style={{ justifyContent: 'flex-start' }}>
            <MessageSquare size={18} strokeWidth={STROKE} /> Contact us
          </h2>
          <form className="stack" onSubmit={send}>
            <FormError>{error}</FormError>
            <div className="field">
              <label className="label" htmlFor="su-topic">
                Topic
              </label>
              <select id="su-topic" className="select" value={topic} onChange={(e) => setTopic(e.target.value)} required>
                <option value="">Choose a topic</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="su-msg">
                Message
              </label>
              <textarea id="su-msg" className="textarea" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what happened. Include the report link if it is about a report." required />
            </div>
            <div className="row between">
              <span className="hint">You will get a notification when we reply.</span>
              <button className="btn btn-primary" disabled={busy || !topic || message.trim().length < 10}>
                {busy ? <Spinner size={16} /> : <Send size={16} strokeWidth={STROKE} />} Send
              </button>
            </div>
          </form>
        </section>

        {tickets?.length > 0 && (
          <section>
            <h2 style={{ marginBottom: 12 }}>Your messages</h2>
            <div className="card flush">
              {tickets.map((t) => (
                <div key={t.id} className="ticket">
                  <div className="row between">
                    <span className="strong small">{topicLabel(t.topic)}</span>
                    <span className={`tag ${t.status === 'open' ? 'accent' : ''}`}>{t.status === 'open' ? 'Open' : 'Closed'}</span>
                  </div>
                  <p className="small ticket-msg">{t.message}</p>
                  <span className="tiny muted">{timeAgo(t.createdAt)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
