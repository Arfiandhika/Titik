import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Camera, Check, ImagePlus, Info, Sparkles, TriangleAlert, Users, X } from 'lucide-react';
import { api, qs } from '../api.js';
import { useMeta } from '../meta.jsx';
import { useAuth } from '../auth.jsx';
import { compressImage, getPosition, formatCoords, distance } from '../utils.js';
import { CategoryIcon, STROKE, StatusIcon } from '../icons.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { CategoryLabel, Confirm, Spinner, StatusBadge, useToast } from '../components/ui.jsx';
import { authorityAt } from '../components/GoogleMap.jsx';

const STEPS = ['Photo', 'Details', 'Location', 'Check and send'];

// The reporting flow.
export default function NewReportPage() {
  const { meta, category: cats } = useMeta();
  const { refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState('fwd');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ai, setAi] = useState({ state: 'idle', suggestion: null });
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [dupes, setDupes] = useState(null);
  const [dupesSeen, setDupesSeen] = useState(false);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const titleTouched = useRef(false);
  const autoLocated = useRef(false);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  // Warn before a reload or closing the tab throws away a half-finished report.
  const dirty = Boolean(photo || title.trim() || description.trim() || location) && !sent;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // photo + AI suggestion
  async function choosePhoto(file) {
    if (!file) return;
    try {
      const small = await compressImage(file);
      setPhoto(small);
      setPreview(URL.createObjectURL(small));
      setErrors((e) => ({ ...e, photo: null }));
      if (meta.aiEnabled) suggest(small);
    } catch (err) {
      setErrors((e) => ({ ...e, photo: err.message }));
    }
  }

  async function suggest(file) {
    setAi({ state: 'loading', suggestion: null });
    try {
      const form = new FormData();
      form.append('photo', file);
      const { suggestion } = await api('/ai/classify', { method: 'POST', form });
      setAi({ state: suggestion ? 'done' : 'none', suggestion });
      if (suggestion && suggestion.isIssue && suggestion.confidence >= 0.5) {
        setCategory((c) => c || suggestion.category);
        if (!titleTouched.current && suggestion.title) setTitle((t) => t || suggestion.title);
      }
    } catch {
      setAi({ state: 'none', suggestion: null });
    }
  }

  function removePhoto() {
    setPhoto(null);
    setPreview(null);
    setAi({ state: 'idle', suggestion: null });
  }

  // location: try GPS once when the step opens
  useEffect(() => {
    if (step !== 2 || location || autoLocated.current) return;
    autoLocated.current = true;
    getPosition()
      .then((p) => setLocation({ ...p, source: 'gps' }))
      .catch(() => {});
  }, [step, location]);

  // Look for open reports nearby whenever the pin moves.
  useEffect(() => {
    if (!location) return undefined;
    setDupesSeen(false);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api(`/reports/duplicates${qs({ lat: location.lat, lng: location.lng, accuracy: location.accuracy ?? 0, category })}`, { signal: ctrl.signal })
        .then(({ reports }) => setDupes(reports.filter((r) => !r.isMine)))
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [location, category]);

  const onAddress = useCallback((a) => setAddress(a), []);

  // validation per step (error prevention)
  function validate(s = step) {
    const e = {};
    if (s === 0 && !photo) e.photo = 'Add a photo so the council can see the problem.';
    if (s === 1) {
      if (!category) e.category = 'Choose the closest category.';
      if (title.trim().length < 3) e.title = 'Give it a short title, e.g. "Pothole outside the school".';
    }
    if (s === 2 && !location) e.location = 'Set the location: use your GPS or tap the map.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validate()) return;
    if (step === 2 && dupes?.length && !dupesSeen) {
      setDupesSeen(true);
      document.getElementById('dupes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setDir('fwd');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo(0, 0);
  }

  function leave() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/', { replace: true });
  }

  function back() {
    if (step === 0) return dirty ? setDiscarding(true) : leave();
    setErrors({});
    setDir('back');
    setStep((s) => s - 1);
  }

  async function sameIssue(r) {
    try {
      if (r.myVote !== 'metoo') await api(`/reports/${r.id}/vote`, { method: 'POST', body: { type: 'metoo', via: 'duplicate' } });
      toast.ok('Added your "Me too" to the existing report. Thanks for not doubling up.');
      navigate(`/reports/${r.id}`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function submit() {
    for (let s = 0; s < 3; s++) {
      if (!validate(s)) return setStep(s);
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append('photo', photo);
      form.append('title', title.trim());
      form.append('description', description.trim());
      form.append('category', category);
      form.append('lat', String(location.lat));
      form.append('lng', String(location.lng));
      if (location.accuracy != null) form.append('accuracy', String(location.accuracy));
      form.append('address', address.trim());
      if (ai.suggestion) {
        form.append('aiCategory', ai.suggestion.category);
        form.append('aiConfidence', String(ai.suggestion.confidence));
      }
      const { report } = await api('/reports', { method: 'POST', form });
      refresh();
      setSent(report);
      window.scrollTo(0, 0);
    } catch (err) {
      toast.error(err);
      setSending(false);
    }
  }

  const council = location && authorityAt(location.lat, location.lng, meta.authorities);

  if (sent) return <SentScreen report={sent} points={meta.points.REPORT} />;

  return (
    <div className="page narrow">
      <button type="button" className="back" onClick={back}>
        <ArrowLeft size={16} strokeWidth={STROKE} /> {step === 0 ? 'Cancel' : 'Back'}
      </button>
      <div className="page-head">
        <div>
          <h1>Report a problem</h1>
          <p>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
        </div>
      </div>
      <div className="wizard-steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <div key={s} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      <div className="card">
        <div key={step} className={`wizard-step ${dir}`}>
        {step === 0 && (
          <div className="stack">
            <h2>Take or choose a photo</h2>
            <p className="muted small">A clear photo helps the council find and fix the problem faster.</p>
            {preview ? (
              <div className="photo-preview">
                <img src={preview} alt="Your photo" />
                <button type="button" className="icon-btn" onClick={removePhoto} aria-label="Remove photo">
                  <X size={18} strokeWidth={STROKE} />
                </button>
              </div>
            ) : (
              <PhotoDrop onFile={choosePhoto} />
            )}
            {errors.photo && <ErrorText>{errors.photo}</ErrorText>}
            <AiStatus ai={ai} enabled={meta.aiEnabled} cats={cats} />
          </div>
        )}

        {step === 1 && (
          <div className="stack lg">
            <div className="field">
              <span className="label" id="cat-label">
                What kind of problem is it?
              </span>
              <AiStatus ai={ai} enabled={meta.aiEnabled} cats={cats} compact />
              <div className="cat-grid" role="radiogroup" aria-labelledby="cat-label">
                {meta.categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={category === c.id}
                    className={`cat-option ${category === c.id ? 'active' : ''}`}
                    style={{ '--c': c.color }}
                    onClick={() => setCategory(c.id)}
                    title={c.hint}
                  >
                    <span className="row" style={{ width: '100%' }}>
                      <span className="cat-dot">
                        <CategoryIcon id={c.id} size={17} />
                      </span>
                      {ai.suggestion?.category === c.id && (
                        <span className="tag accent ai-tag">
                          <Sparkles size={11} strokeWidth={STROKE} /> Suggested
                        </span>
                      )}
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
              {category && <span className="hint">{cats[category]?.hint}</span>}
              {errors.category && <ErrorText>{errors.category}</ErrorText>}
            </div>
            <div className="field">
              <label className="label" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                className="input"
                value={title}
                maxLength={100}
                placeholder="e.g. Deep pothole outside SK Bangsar"
                aria-invalid={Boolean(errors.title)}
                onChange={(e) => {
                  titleTouched.current = true;
                  setTitle(e.target.value);
                }}
              />
              {errors.title && <ErrorText>{errors.title}</ErrorText>}
            </div>
            <div className="field">
              <label className="label" htmlFor="desc">
                Details <span className="opt">(optional)</span>
              </label>
              <textarea
                id="desc"
                className="textarea"
                value={description}
                maxLength={1000}
                placeholder="How big is it, is it dangerous, since when?"
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className="hint">{description.length}/1000</span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <h2>Where is it?</h2>
            <LocationPicker value={location} onChange={setLocation} address={address} onAddress={onAddress} nearby={dupes || []} />
            {errors.location && <ErrorText>{errors.location}</ErrorText>}
            {dupes?.length > 0 && (
              <div id="dupes" className={`notice ${dupesSeen ? 'warn' : ''}`} style={{ flexDirection: 'column', gap: 10 }}>
                <div className="row">
                  <Info size={17} strokeWidth={STROKE} />
                  <strong>Is it one of these?</strong>
                </div>
                <p className="small">
                  {dupes.length === 1 ? 'Someone already reported a problem' : `${dupes.length} problems were already reported`} right next to this spot. If
                  it is the same, add your "Me too" instead of a new report.
                </p>
                <div className="stack" style={{ gap: 8, width: '100%' }}>
                  {dupes.map((r) => (
                    <div key={r.id} className="card" style={{ padding: 10 }}>
                      <div className="row" style={{ alignItems: 'flex-start' }}>
                        <img src={r.photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
                        <div className="grow">
                          <div className="row wrap" style={{ gap: 6 }}>
                            <CategoryLabel category={r.category} size={14} />
                            <StatusBadge status={r.status} />
                          </div>
                          <div className="strong small" style={{ marginTop: 4 }}>
                            {r.title}
                          </div>
                          <div className="tiny muted">
                            {distance(r.distance)} away · {r.metoo} said Me too
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                        <a href={`/reports/${r.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                          View
                        </a>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => sameIssue(r)}>
                          <Users size={15} strokeWidth={STROKE} /> Same issue
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {dupesSeen && <p className="small">Not the same? Press Next again to carry on with a new report.</p>}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <h2>Check and send</h2>
            <div className="photo-preview">
              <img src={preview} alt="Your photo" />
            </div>
            <dl className="facts">
              <dt>Category</dt>
              <dd>
                <CategoryLabel category={category} />
              </dd>
              <dt>Title</dt>
              <dd>{title}</dd>
              {description && (
                <>
                  <dt>Details</dt>
                  <dd>{description}</dd>
                </>
              )}
              <dt>Location</dt>
              <dd>{address || formatCoords(location)}</dd>
              <dt>Goes to</dt>
              <dd>{council?.name || 'Council staff will route it'}</dd>
            </dl>
            <div className="notice small">
              <Check size={16} strokeWidth={STROKE} />
              You can edit or delete this report until the council starts reviewing it. You earn {meta.points.REPORT} points for posting.
            </div>
          </div>
        )}

        </div>

        <div className="wizard-foot">
          <button type="button" className="btn btn-ghost" onClick={back}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={next}>
              Next
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={sending}>
              {sending && <Spinner size={16} />} Send report
            </button>
          )}
        </div>
      </div>
      {discarding && (
        <Confirm
          title="Discard this report?"
          message="Your photo and details will be lost."
          confirmLabel="Discard"
          danger
          onConfirm={leave}
          onClose={() => setDiscarding(false)}
        />
      )}
    </div>
  );
}

const NEXT_STEPS = [
  { status: 'under_review', title: 'The council checks it', hint: 'You can edit or delete it until they start.' },
  { status: 'in_progress', title: 'Work starts', hint: 'A crew is sent to fix it.' },
  { status: 'resolved', title: 'Fixed', hint: 'They add a photo of the fixed spot.' },
];

// Shown once the report is in: where it went, the points, and what happens next.
function SentScreen({ report, points }) {
  const navigate = useNavigate();
  const routed = report.authority;
  useEffect(() => {
    navigator.vibrate?.(30);
  }, []);
  return (
    <div className="page narrow">
      <div className="card sent" role="status">
        <svg className="sent-tick" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="32" />
          <path d="M19 33.5l8.5 8.5L45 24.5" />
        </svg>
        <h1>Report sent</h1>
        <p className="muted">
          {routed ? (
            <>
              It went to <strong className="text">{report.authorityName}</strong>.
            </>
          ) : (
            'Council staff will send it to the right council.'
          )}{' '}
          You earned <strong className="accent-text">+{points} points</strong>.
        </p>

        <div className="sent-next">
          <h2>What happens next</h2>
          <ol>
            {NEXT_STEPS.map((s) => (
              <li key={s.status} className={`st-${s.status}`}>
                <span className="sent-dot">
                  <StatusIcon id={s.status} size={15} />
                </span>
                <span>
                  <span className="strong">{s.title}</span>
                  <span className="tiny muted">{s.hint}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="row small muted" style={{ gap: 8 }}>
            <Bell size={15} strokeWidth={STROKE} aria-hidden="true" /> We notify you at each step.
          </p>
        </div>

        <div className="stack" style={{ gap: 8, width: '100%' }}>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(`/reports/${report.id}`, { replace: true })}>
            View my report
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate('/', { replace: true })}>
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorText({ children }) {
  return (
    <div className="error-text" role="alert">
      <TriangleAlert size={15} strokeWidth={STROKE} /> {children}
    </div>
  );
}

function AiStatus({ ai, enabled, cats, compact }) {
  if (!enabled || ai.state === 'idle') return null;
  if (ai.state === 'loading') {
    return (
      <div className="row small muted">
        <Spinner size={15} /> Looking at your photo to suggest a category
      </div>
    );
  }
  if (ai.state === 'none' || !ai.suggestion) {
    return compact ? null : <p className="hint">No suggestion this time. You will pick the category next.</p>;
  }
  const s = ai.suggestion;
  if (!s.isIssue) {
    return (
      <div className="notice warn small">
        <TriangleAlert size={16} strokeWidth={STROKE} /> This photo may not show a public infrastructure problem. You can still continue.
      </div>
    );
  }
  return (
    <div className="row small">
      <Sparkles size={15} strokeWidth={STROKE} style={{ color: 'var(--primary)' }} />
      <span>
        Looks like <strong>{cats[s.category]?.label}</strong>
        {compact ? '. You can pick another if it is wrong.' : '. You can change it in the next step.'}
      </span>
    </div>
  );
}

function PhotoDrop({ onFile }) {
  const [drag, setDrag] = useState(false);
  const camRef = useRef(null);
  const fileRef = useRef(null);
  return (
    <div
      className={`dropzone ${drag ? 'drag' : ''}`}
      onClick={() => fileRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        onFile(e.dataTransfer.files?.[0]);
      }}
    >
      <ImagePlus size={30} strokeWidth={STROKE} className="muted" />
      <div>
        <div className="strong">Add a photo</div>
        <div className="small muted">Drop an image here, or choose one</div>
      </div>
      <div className="row wrap" style={{ justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => camRef.current?.click()}>
          <Camera size={16} strokeWidth={STROKE} /> Take photo
        </button>
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={16} strokeWidth={STROKE} /> Choose file
        </button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}
