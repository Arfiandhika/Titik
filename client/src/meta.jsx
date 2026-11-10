import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

// FR5: categories, statuses and councils come from the server (/api/meta), never hard-coded here.
const MetaContext = createContext(null);

export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api('/meta')
        .then((m) => alive && setMeta(m))
        .catch((e) => {
          if (!alive) return;
          setError(e.message);
          setTimeout(load, 3000);
        });
    load();
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => {
    if (!meta) return { meta: null, error };
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
    return {
      meta,
      error: null,
      category: byId(meta.categories),
      status: byId(meta.statuses),
      authority: byId(meta.authorities),
    };
  }, [meta, error]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export const useMeta = () => useContext(MetaContext);
