import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, MessageCircle } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { STROKE } from '../icons.jsx';
import { timeAgo } from '../utils.js';
import { Avatar, Empty, Spinner, useToast } from './ui.jsx';

// FR15. In a sheet (`inSheet`) the list scrolls and the composer stays at the bottom; `autoFocus` opens the keyboard.
export default function Comments({ reportId, onCount, autoFocus = false, inSheet = false }) {
  const { user } = useAuth();
  const { authority } = useMeta();
  const toast = useToast();
  const [comments, setComments] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useLayoutEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Grow the box with its text (up to about 5 lines).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const border = el.offsetHeight - el.clientHeight; // include the border so the text never overflows by a pixel
    el.style.height = `${Math.min(el.scrollHeight + border, 120)}px`;
  }, [body]);

  useEffect(() => {
    api(`/reports/${reportId}/comments`)
      .then(({ comments }) => setComments(comments))
      .catch((e) => toast.error(e));
  }, [reportId, toast]);

  useEffect(() => {
    if (comments) onCount?.(comments.length);
  }, [comments, onCount]);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const { comment } = await api(`/reports/${reportId}/comments`, { method: 'POST', body: { body } });
      setComments((c) => [...c, comment]);
      setBody('');
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await api(`/reports/${reportId}/comments/${id}`, { method: 'DELETE' });
      setComments((c) => c.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(err);
    }
  }

  const list =
    comments === null ? (
      <Spinner />
    ) : comments.length === 0 ? (
      <Empty icon={MessageCircle} title="No comments yet">
        Add details that help the council find or fix this.
      </Empty>
    ) : (
      <div className="comments">
        {comments.map((c) => (
          <div key={c.id} className={`comment ${c.author.role === 'official' ? 'official' : ''}`}>
            <Avatar user={c.author} />
            <div className="bubble">
              <div className="row small">
                <Link to={`/users/${c.author.id}`} className="strong" style={{ color: 'var(--text)' }}>
                  {c.author.name}
                </Link>
                {c.author.role === 'official' && <span className="tag accent">{authority?.[c.author.authority]?.short || 'Council'} staff</span>}
                <span className="muted tiny">{timeAgo(c.createdAt)}</span>
                {user?.id === c.author.id && (
                  <button type="button" className="icon-btn sm" style={{ marginLeft: 'auto' }} onClick={() => remove(c.id)} aria-label="Delete comment">
                    <Trash2 size={15} strokeWidth={STROKE} />
                  </button>
                )}
              </div>
              <p className="body">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
    );

  const composer = user?.verified ? (
    <form onSubmit={submit} className="composer">
      <Avatar user={user} />
      <label className="sr-only" htmlFor={`comment-${reportId}`}>
        Comment
      </label>
      <textarea
        id={`comment-${reportId}`}
        ref={inputRef}
        rows={1}
        className="composer-input"
        placeholder="Add a comment"
        enterKeyHint="send"
        value={body}
        maxLength={1000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter posts on a keyboard; Shift+Enter adds a new line.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
        }}
      />
      <button className="composer-send" disabled={busy || !body.trim()}>
        {busy ? <Spinner size={16} /> : 'Post'}
      </button>
    </form>
  ) : (
    <p className="small muted composer-note">
      {user ? (
        <>
          <Link to="/verify">Verify your account</Link> to comment.
        </>
      ) : (
        <>
          <Link to="/login" state={{ from: `/reports/${reportId}` }}>
            Sign in
          </Link>{' '}
          to comment.
        </>
      )}
    </p>
  );

  if (inSheet) {
    return (
      <>
        <div className="sheet-body" ref={listRef}>
          {list}
        </div>
        <div className="sheet-foot">{composer}</div>
      </>
    );
  }
  return (
    <div className="stack">
      {list}
      {composer}
    </div>
  );
}
