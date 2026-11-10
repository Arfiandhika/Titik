import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Download, LifeBuoy, LogOut, ShieldCheck, Mail, Phone, MapPin, Inbox, Share, SquarePlus, Trophy, UserX } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { BADGE_ICONS, Icon, STROKE } from '../icons.jsx';
import { Avatar, Empty, Loading, Sheet, useToast } from '../components/ui.jsx';
import { useInstall } from '../utils.js';
import ReportCard from '../components/ReportCard.jsx';

// FR3: own profile (editable) and public profiles (NFR1: name only).
export default function ProfilePage() {
  const { id } = useParams();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const own = !id || Number(id) === user?.id;
  const userId = own ? user?.id : Number(id);
  const [profile, setProfile] = useState(null);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    setProfile(null);
    api(`/users/${userId}`).then(setProfile).catch(setError);
    // Your own reports are on the home feed ("My reports"); only other people's are listed here.
    if (own) return;
    api(`/reports${qs({ user: userId, limit: 6 })}`)
      .then(setReports)
      .catch(() => setReports({ total: 0, reports: [] }));
  }, [userId, own]);

  if (error) {
    return (
      <div className="page narrow">
        <Empty icon={UserX} title="Profile not found" />
      </div>
    );
  }
  if (!profile) return <Loading />;
  const p = profile.user;

  return (
    <div className="page medium">
      <div className="stack lg">
        <section className="card">
          <div className="row" style={{ gap: 16 }}>
            <Avatar user={p} size="lg" />
            <div className="grow">
              <h1 style={{ fontSize: 22 }}>{p.name}</h1>
              <p className="small muted">
                {p.role === 'official' ? `${p.authorityName} staff` : 'Resident'} · joined {p.joined}
              </p>
            </div>
          </div>
          <div className="grid cols-4" style={{ marginTop: 18 }}>
            <MiniStat label="Reports" value={profile.stats.reports} />
            <MiniStat label="Fixed" value={profile.stats.resolved} />
            <MiniStat label='"Me too"' value={profile.stats.metoos} />
            <MiniStat label="Points earned" value={profile.stats.earned} />
          </div>
          {profile.badges.length > 0 && (
            <div className="badges" style={{ marginTop: 16 }}>
              {profile.badges.map((b) => (
                <span key={b.id} className="badge-pill" title={b.description}>
                  <Icon as={BADGE_ICONS[b.id]} size={15} /> {b.label}
                </span>
              ))}
            </div>
          )}
        </section>

        {own && (
          <nav className="card flush settings" aria-label="Profile sections">
            <SectionLink to="/leaderboard" icon={Trophy} title="Leaderboard" hint="See who did the most for their neighbourhood" />
            <SectionLink to="/profile/security" icon={ShieldCheck} title="Security" hint="Change password or email, forgot password" />
            <SectionLink to="/profile/support" icon={LifeBuoy} title="Customer support" hint="Common questions and contact us" />
            <InstallRow />
          </nav>
        )}

        {own && <AccountCard />}

        {own && (
          <div className="card flush">
            <button
              type="button"
              className="settings-row danger"
              onClick={() => {
                signOut();
                navigate('/');
              }}
            >
              <span className="settings-ic">
                <Icon as={LogOut} size={18} />
              </span>
              <span className="grow">
                <span className="strong">Sign out</span>
              </span>
            </button>
          </div>
        )}

        {!own && (
          <section>
            <h2 style={{ marginBottom: 12 }}>Reports</h2>
            {!reports ? (
              <Loading />
            ) : reports.reports.length === 0 ? (
              <Empty icon={Inbox} title="No reports yet" />
            ) : (
              <div className="grid cards">
                {reports.reports.map((r) => (
                  <ReportCard key={r.id} report={r} />
                ))}
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  );
}

function SectionLink({ to, icon: Ic, title, hint }) {
  return (
    <Link to={to} className="settings-row">
      <span className="settings-ic">
        <Icon as={Ic} size={18} />
      </span>
      <span className="grow">
        <span className="strong">{title}</span>
        <span className="tiny muted">{hint}</span>
      </span>
      <ChevronRight size={18} strokeWidth={STROKE} className="muted" aria-hidden="true" />
    </Link>
  );
}

// Install Titik on the home screen (PWA). Hidden once it runs as an installed app.
function InstallRow() {
  const install = useInstall();
  const toast = useToast();
  const [help, setHelp] = useState(false);
  if (install.installed) return null;

  async function onClick() {
    if (install.canPrompt) {
      if (await install.prompt()) toast.ok('Titik is on your home screen.');
    } else setHelp(true);
  }

  return (
    <>
      <button type="button" className="settings-row" onClick={onClick}>
        <span className="settings-ic">
          <Icon as={Download} size={18} />
        </span>
        <span className="grow">
          <span className="strong">Install the app</span>
          <span className="tiny muted">Add Titik to your home screen</span>
        </span>
        <ChevronRight size={18} strokeWidth={STROKE} className="muted" aria-hidden="true" />
      </button>
      {help && (
        <Sheet title="Install Titik" onClose={() => setHelp(false)}>
          <div className="sheet-body">
            {install.isIOS ? (
              <ol className="install-steps">
                <li>
                  Tap <Share size={16} strokeWidth={STROKE} aria-label="Share" /> <strong>Share</strong> at the bottom of Safari.
                </li>
                <li>
                  Choose <SquarePlus size={16} strokeWidth={STROKE} aria-hidden="true" /> <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong>. Titik opens full screen from its icon.
                </li>
              </ol>
            ) : (
              <ol className="install-steps">
                <li>
                  Open the browser menu (<strong>&#8942;</strong>).
                </li>
                <li>
                  Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </li>
                <li>Confirm. Titik opens full screen from its icon.</li>
              </ol>
            )}
            <p className="hint" style={{ marginTop: 12 }}>
              Installing needs a secure (https) link. It does not work from a local network address.
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="stat" style={{ padding: 12, background: 'var(--bg)' }}>
      <span className="k">{label}</span>
      <span className="v" style={{ fontSize: 20 }}>
        {value}
      </span>
    </div>
  );
}

function AccountCard() {
  const { user, setUser } = useAuth();
  const { authority } = useMeta();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [homeArea, setHomeArea] = useState(user.homeArea || '');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { user: u } = await api('/auth/me', { method: 'PATCH', body: { name, homeArea } });
      setUser(u);
      toast.ok('Profile saved.');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginBottom: 6 }}>Account</h2>
      <p className="small muted" style={{ marginBottom: 14 }}>
        Only you can see your email and phone. Others see your name only.
      </p>
      <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
        {user.email && (
          <div className="row small">
            <Mail size={15} strokeWidth={STROKE} className="muted" /> {user.email}
          </div>
        )}
        {user.phone && (
          <div className="row small">
            <Phone size={15} strokeWidth={STROKE} className="muted" /> {user.phone}
          </div>
        )}
        {user.role === 'official' && (
          <div className="row small">
            <MapPin size={15} strokeWidth={STROKE} className="muted" /> {authority[user.authority]?.name}
          </div>
        )}
        <div className="row small">
          <ShieldCheck size={15} strokeWidth={STROKE} className="muted" />
          {user.verified ? 'Verified' : <Link to="/verify">Not verified yet. Verify now</Link>}
        </div>
      </div>
      <form className="stack" onSubmit={save}>
        <div className="grid cols-2">
          <div className="field">
            <label className="label" htmlFor="p-name">
              Display name
            </label>
            <input id="p-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="p-area">
              Neighbourhood <span className="opt">(optional)</span>
            </label>
            <input id="p-area" className="input" value={homeArea} maxLength={80} placeholder="e.g. Bangsar" onChange={(e) => setHomeArea(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>
            Save
          </button>
        </div>
      </form>
    </section>
  );
}
