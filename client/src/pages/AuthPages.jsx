import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, TriangleAlert, Info, MapPin } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { STROKE } from '../icons.jsx';
import { Spinner, useToast } from '../components/ui.jsx';

const DEMO = [
  { label: 'Resident', id: 'demo@titik.my', pw: 'demo123' },
  { label: 'Resident (phone)', id: '012-345 6789', pw: 'demo123' },
  { label: 'DBKL staff', id: 'dbkl@titik.my', pw: 'official123' },
  { label: 'MBPJ staff', id: 'mbpj@titik.my', pw: 'official123' },
];

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card stack lg">
        <div className="stack" style={{ gap: 8, alignItems: 'center', textAlign: 'center' }}>
          <span className="brand-mark" style={{ width: 44, height: 44, borderRadius: 14 }}>
            <MapPin size={22} strokeWidth={STROKE} />
          </span>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <div className="card">{children}</div>
      </div>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="notice danger small" role="alert">
      <TriangleAlert size={16} strokeWidth={STROKE} /> {children}
    </div>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-group">
      <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} required />
      <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={17} strokeWidth={STROKE} /> : <Eye size={17} strokeWidth={STROKE} />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const from = location.state?.from || '/';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Redirect happens here (not in submit) so it can't race with this render.
  if (user) return <Navigate to={user.role === 'official' && from === '/' ? '/dashboard' : from} replace />;

  async function submit(e, creds) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: creds || { identifier, password } });
      toast.ok(`Welcome back, ${user.name.split(' ')[0]}.`);
      signIn(token, user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Report problems and follow them until they are fixed.">
      <form className="stack" onSubmit={submit}>
        <FormError>{error}</FormError>
        <div className="field">
          <label className="label" htmlFor="li-id">
            Email or mobile number
          </label>
          <input id="li-id" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
        </div>
        <div className="field">
          <div className="row between">
            <label className="label" htmlFor="li-pw">
              Password
            </label>
            <Link to="/forgot" state={{ identifier, back: location.state?.from }} className="small">
              Forgot password?
            </Link>
          </div>
          <PasswordInput id="li-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy && <Spinner size={16} />} Sign in
        </button>
        <p className="small muted" style={{ textAlign: 'center' }}>
          New here? <Link to="/register" state={location.state}>Create an account</Link>
        </p>
      </form>
      <hr className="divider" />
      <div className="stack" style={{ gap: 8 }}>
        <span className="small muted">Demo accounts for the prototype</span>
        <div className="demo-logins">
          {DEMO.map((d) => (
            <button key={d.id} type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => submit(null, { identifier: d.id, password: d.pw })}>
              <span>{d.label}</span>
              <span className="muted tiny">{d.id}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, signIn } = useAuth();
  const { meta } = useMeta();
  const location = useLocation();
  const [role, setRole] = useState('resident');
  const [form, setForm] = useState({ name: '', identifier: '', password: '', officialCode: '', authority: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const next = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (user) return <Navigate to={user.verified ? '/' : '/verify'} replace state={next.current} />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api('/auth/register', { method: 'POST', body: { ...form, role } });
      next.current = { devCode: res.devCode, from: location.state?.from };
      signIn(res.token, res.user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create an account" subtitle="Use your email or Malaysian mobile number.">
      <form className="stack" onSubmit={submit}>
        <div className="seg block" role="tablist" aria-label="Account type">
          <button type="button" role="tab" aria-selected={role === 'resident'} className={role === 'resident' ? 'active' : ''} onClick={() => setRole('resident')}>
            Resident
          </button>
          <button type="button" role="tab" aria-selected={role === 'official'} className={role === 'official' ? 'active' : ''} onClick={() => setRole('official')}>
            Council staff
          </button>
        </div>
        <FormError>{error}</FormError>
        <div className="field">
          <label className="label" htmlFor="rg-name">
            Name
          </label>
          <input id="rg-name" className="input" value={form.name} onChange={set('name')} autoComplete="name" maxLength={60} required />
          <span className="hint">Shown on your reports and comments.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="rg-id">
            Email or mobile number
          </label>
          <input id="rg-id" className="input" value={form.identifier} onChange={set('identifier')} autoComplete="username" placeholder="you@example.com or 012-345 6789" required />
          <span className="hint">We send a code here to check it is you. It is never shown to other people.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="rg-pw">
            Password
          </label>
          <PasswordInput id="rg-pw" value={form.password} onChange={set('password')} autoComplete="new-password" />
          <span className="hint">At least 6 characters.</span>
        </div>
        {role === 'official' && (
          <>
            <div className="field">
              <label className="label" htmlFor="rg-auth">
                Council
              </label>
              <select id="rg-auth" className="select" value={form.authority} onChange={set('authority')} required>
                <option value="">Choose your council</option>
                {meta.authorities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="rg-code">
                Staff sign-up code
              </label>
              <input id="rg-code" className="input" value={form.officialCode} onChange={set('officialCode')} required />
              <span className="hint">Given by your council's Titik administrator.</span>
            </div>
          </>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy && <Spinner size={16} />} Create account
        </button>
        <p className="small muted" style={{ textAlign: 'center' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}

// Forgot password: get a code by email/SMS, then set a new password (signs you in).
export function ForgotPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [identifier, setIdentifier] = useState(location.state?.identifier || '');
  const [step, setStep] = useState('ask'); // ask -> reset
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function ask(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api('/auth/forgot', { method: 'POST', body: { identifier } });
      setDevCode(res.devCode || null);
      setStep('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api('/auth/reset', { method: 'POST', body: { identifier, code, newPassword: password } });
      signIn(token, user);
      toast.ok('Password changed. You are signed in.');
      navigate(location.state?.back || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (step === 'ask') {
    return (
      <AuthShell title="Forgot password" subtitle="We will send you a code to set a new password.">
        <form className="stack" onSubmit={ask}>
          <FormError>{error}</FormError>
          <div className="field">
            <label className="label" htmlFor="fp-id">
              Email or mobile number
            </label>
            <input id="fp-id" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !identifier.trim()}>
            {busy && <Spinner size={16} />} Send code
          </button>
          <p className="small muted" style={{ textAlign: 'center' }}>
            Remembered it? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle={`If an account uses ${identifier.trim()}, we sent it a 6-digit code.`}>
      <form className="stack" onSubmit={reset}>
        {devCode && (
          <div className="notice small">
            <Info size={16} strokeWidth={STROKE} />
            <span>
              Prototype: no email or SMS service is connected, so here is your code: <strong>{devCode}</strong>
            </span>
          </div>
        )}
        <FormError>{error}</FormError>
        <div className="field">
          <label className="label" htmlFor="fp-code">
            Code
          </label>
          <input
            id="fp-code"
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="fp-pw">
            New password
          </label>
          <PasswordInput id="fp-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <span className="hint">At least 6 characters.</span>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6 || password.length < 6}>
          {busy && <Spinner size={16} />} Save new password
        </button>
        <div className="row between small">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('ask')}>
            Use another email or number
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={ask} disabled={busy}>
            Send again
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

// Verify with the 6-digit code.
export function VerifyPage() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(location.state?.devCode || null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const from = location.state?.from;

  if (user.verified) return <Navigate to={from || (user.role === 'official' ? '/dashboard' : '/new')} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user: u } = await api('/auth/verify', { method: 'POST', body: { code } });
      toast.ok('Account verified. You can now report problems.');
      setUser(u);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const res = await api('/auth/resend', { method: 'POST' });
      setDevCode(res.devCode || null);
      toast.ok('A new code was sent.');
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <AuthShell title="Check your code" subtitle={`We sent a 6-digit code to ${user.email || user.phone}.`}>
      <form className="stack" onSubmit={submit}>
        {devCode && (
          <div className="notice small">
            <Info size={16} strokeWidth={STROKE} />
            <span>
              Prototype: no email or SMS service is connected, so here is your code: <strong>{devCode}</strong>
            </span>
          </div>
        )}
        <FormError>{error}</FormError>
        <div className="field">
          <label className="label" htmlFor="vf-code">
            Verification code
          </label>
          <input
            id="vf-code"
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
          {busy && <Spinner size={16} />} Verify
        </button>
        <div className="row between small">
          <button type="button" className="btn btn-ghost btn-sm" onClick={resend}>
            Send a new code
          </button>
          <Link to="/">Skip for now</Link>
        </div>
        <p className="hint">You can browse without verifying, but you need to verify to post, vote, comment or redeem rewards.</p>
      </form>
    </AuthShell>
  );
}
