import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  APILoadingStatus,
  Map as GMap,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { Minus, Plus } from 'lucide-react';
import Supercluster from 'supercluster';
import { useMeta } from '../meta.jsx';
import { CategoryIcon, STROKE } from '../icons.jsx';
import { useTheme } from '../utils.js';

export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

export function MapsProvider({ children }) {
  if (!MAPS_KEY) return children;
  return (
    <APIProvider apiKey={MAPS_KEY} region="MY" language="en">
      {children}
    </APIProvider>
  );
}

/** 'google' when the Maps API is usable, otherwise 'plain' (no key, bad key, or offline). */
export function useMapMode() {
  if (!MAPS_KEY) return 'plain';
  // eslint-disable-next-line react-hooks/rules-of-hooks -- MAPS_KEY is a build-time constant.
  const status = useApiLoadingStatus();
  return status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE ? 'plain' : 'google';
}

/** Client preview of council routing. The server makes the real decision. */
export function authorityAt(lat, lng, authorities = []) {
  return authorities.find((a) => {
    const [s, w, n, e] = a.box || [];
    return lat >= s && lat <= n && lng >= w && lng <= e;
  });
}

export function Pin({ category, active, dim, here, resolved, ring }) {
  const { category: cats } = useMeta();
  const color = here ? undefined : cats?.[category]?.color;
  const cls = ['pin', active && 'active', dim && 'dim', here && 'here', resolved && 'resolved', ring && `ring st-${ring}`].filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ '--c': color }}>
      <CategoryIcon id={here ? 'other' : category} size={14} />
    </div>
  );
}

// Clustering: nearby pins merge into a count bubble when zoomed out.
// Tap a bubble to zoom in. From zoom 17 every report has its own pin.
const CLUSTER_RADIUS = 60; // px
const CLUSTER_MAX_ZOOM = 16;

function useClusters(reports, selectedId, cam) {
  // The selected report is kept out of the index so it always shows as its own pin.
  const index = useMemo(() => {
    const sc = new Supercluster({ radius: CLUSTER_RADIUS, maxZoom: CLUSTER_MAX_ZOOM, minPoints: 2 });
    sc.load(
      reports
        .filter((r) => r.id !== selectedId)
        .map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lng, r.lat] }, properties: { report: r } })),
    );
    return sc;
  }, [reports, selectedId]);
  const items = useMemo(() => (cam ? index.getClusters(cam.bbox, Math.floor(cam.zoom)) : []), [index, cam]);
  const expand = (item) => {
    const [lng, lat] = item.geometry.coordinates;
    return { lat, lng, zoom: Math.min(18, index.getClusterExpansionZoom(item.properties.cluster_id)) };
  };
  return { items, expand };
}

export function ClusterBubble({ count }) {
  const size = Math.round(Math.min(58, 34 + Math.log2(count) * 5));
  return (
    <div className="cluster" style={{ width: size, height: size }} role="button" aria-label={`${count} reports here. Zoom in.`}>
      {count > 999 ? `${Math.floor(count / 1000)}k` : count}
    </div>
  );
}

// Report map
export function ReportMap({ reports, selectedId, onSelect, me, focus, center, zoom = 12, ringStatus = false }) {
  const mode = useMapMode();
  const [theme] = useTheme();
  const { meta } = useMeta();
  const start = center || meta?.mapCenter || { lat: 3.139, lng: 101.6869 };
  const [cam, setCam] = useState(null); // { bbox: [w, s, e, n], zoom }
  const [pan, setPan] = useState(null);
  useEffect(() => {
    if (focus) setPan(focus);
  }, [focus]);
  const { items, expand } = useClusters(reports, selectedId, cam);
  const selected = reports.find((r) => r.id === selectedId);
  const pinFor = (r) => <Pin category={r.category} active={r.id === selectedId} resolved={r.status === 'resolved'} ring={ringStatus ? r.status : null} />;

  if (mode === 'plain') {
    return (
      <PlainMap
        center={start}
        zoom={zoom}
        focus={pan}
        onView={setCam}
        onClick={() => onSelect?.(null)}
        markers={[
          ...items.map((it) =>
            it.properties.cluster
              ? { id: `c${it.properties.cluster_id}`, lat: it.geometry.coordinates[1], lng: it.geometry.coordinates[0], center: true, onClick: () => setPan(expand(it)), el: <ClusterBubble count={it.properties.point_count} /> }
              : { id: it.properties.report.id, lat: it.properties.report.lat, lng: it.properties.report.lng, onClick: () => onSelect?.(it.properties.report.id), el: pinFor(it.properties.report) },
          ),
          ...(selected ? [{ id: selected.id, lat: selected.lat, lng: selected.lng, onClick: () => onSelect?.(selected.id), el: pinFor(selected) }] : []),
          ...(me ? [{ id: 'me', lat: me.lat, lng: me.lng, el: <div className="me-dot" />, center: true }] : []),
        ]}
      />
    );
  }

  return (
    <GMap
      mapId={MAP_ID}
      defaultCenter={start}
      defaultZoom={zoom}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
      key={theme}
      colorScheme={theme === 'light' ? 'LIGHT' : 'DARK'}
      style={{ width: '100%', height: '100%' }}
      onClick={() => onSelect?.(null)}
      onIdle={(e) => {
        const b = e.map.getBounds()?.toJSON();
        if (b) setCam({ bbox: [b.west, b.south, b.east, b.north], zoom: e.map.getZoom() });
      }}
    >
      {items.map((it) => {
        const [lng, lat] = it.geometry.coordinates;
        if (it.properties.cluster) {
          return (
            <AdvancedMarker key={`c${it.properties.cluster_id}`} position={{ lat, lng }} onClick={() => setPan(expand(it))} zIndex={5} anchorPoint={['50%', '50%']}>
              <ClusterBubble count={it.properties.point_count} />
            </AdvancedMarker>
          );
        }
        const r = it.properties.report;
        return (
          <AdvancedMarker key={r.id} position={{ lat: r.lat, lng: r.lng }} onClick={() => onSelect?.(r.id)} zIndex={1} title={r.title}>
            {pinFor(r)}
          </AdvancedMarker>
        );
      })}
      {selected && (
        <AdvancedMarker key={selected.id} position={{ lat: selected.lat, lng: selected.lng }} onClick={() => onSelect?.(selected.id)} zIndex={10} title={selected.title}>
          {pinFor(selected)}
        </AdvancedMarker>
      )}
      {me && (
        <AdvancedMarker position={me} zIndex={20} title="You are here">
          <div className="me-dot" />
        </AdvancedMarker>
      )}
      <PanTo focus={pan} />
    </GMap>
  );
}

function PanTo({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (map && focus) {
      map.panTo({ lat: focus.lat, lng: focus.lng });
      if (focus.zoom) map.setZoom(focus.zoom);
    }
  }, [map, focus]);
  return null;
}

// Point picker: tap the map or drag the pin.
export function PickMap({ value, onChange, others = [] }) {
  const mode = useMapMode();
  const [theme] = useTheme();
  const { meta } = useMeta();
  const center = value || meta?.mapCenter || { lat: 3.139, lng: 101.6869 };
  const focus = useMemo(() => (value ? { lat: value.lat, lng: value.lng } : null), [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === 'plain') {
    return (
      <PlainMap
        center={center}
        zoom={value ? 15 : 12}
        focus={focus}
        onClick={(p) => onChange({ ...p, accuracy: null, source: 'map' })}
        hint="Tap the map to place the pin."
        markers={[
          ...others.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, el: <Pin category={r.category} dim /> })),
          ...(value ? [{ id: 'here', lat: value.lat, lng: value.lng, el: <Pin here active /> }] : []),
        ]}
      />
    );
  }

  return (
    <GMap
      mapId={MAP_ID}
      defaultCenter={center}
      defaultZoom={value ? 17 : 12}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
      key={theme}
      colorScheme={theme === 'light' ? 'LIGHT' : 'DARK'}
      style={{ width: '100%', height: '100%' }}
      onClick={(e) => e.detail.latLng && onChange({ ...e.detail.latLng, accuracy: null, source: 'map' })}
    >
      {others.map((r) => (
        <AdvancedMarker key={r.id} position={{ lat: r.lat, lng: r.lng }} title={r.title}>
          <Pin category={r.category} dim />
        </AdvancedMarker>
      ))}
      {value && (
        <AdvancedMarker
          position={value}
          draggable
          zIndex={20}
          onDragEnd={(e) => e.latLng && onChange({ lat: e.latLng.lat(), lng: e.latLng.lng(), accuracy: null, source: 'map' })}
        >
          <Pin here active />
        </AdvancedMarker>
      )}
      <PanTo focus={focus} />
    </GMap>
  );
}

// Built-in fallback map: council areas on a grid, pan with drag, zoom with buttons or wheel.
// Keeps the app usable without a Google Maps key.
function PlainMap({ center, zoom: startZoom = 12, markers, onClick, focus, hint, onView }) {
  const { meta } = useMeta();
  const ref = useRef(null);
  const [view, setView] = useState({ lat: center.lat, lng: center.lng, zoom: startZoom });
  const [size, setSize] = useState({ w: 600, h: 400 });
  const drag = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (focus) setView((v) => ({ lat: focus.lat, lng: focus.lng, zoom: focus.zoom || Math.max(v.zoom, 14) }));
  }, [focus]);

  // Pixels per degree of longitude; latitude scaled by cos(lat) to keep shapes roughly right.
  const scale = (256 * 2 ** view.zoom) / 360;
  const k = Math.cos((view.lat * Math.PI) / 180);
  const toPx = (lat, lng) => ({ x: size.w / 2 + (lng - view.lng) * scale, y: size.h / 2 - ((lat - view.lat) * scale) / k });
  const toLatLng = (x, y) => ({ lat: view.lat - ((y - size.h / 2) * k) / scale, lng: view.lng + (x - size.w / 2) / scale });

  const setZoom = (z) => setView((v) => ({ ...v, zoom: Math.min(18, Math.max(9, z)) }));

  // Tell the parent what is on screen (used for clustering).
  useEffect(() => {
    if (!onView) return;
    const nw = toLatLng(0, 0);
    const se = toLatLng(size.w, size.h);
    onView({ bbox: [nw.lng, se.lat, se.lng, nw.lat], zoom: view.zoom });
  }, [view, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e) => {
    if (e.target.closest('.marker, .zoom')) return;
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView({ ...d.view, lat: d.view.lat + (dy * k) / scale, lng: d.view.lng - dx / scale });
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && onClick) {
      const rect = ref.current.getBoundingClientRect();
      onClick(toLatLng(e.clientX - rect.left, e.clientY - rect.top));
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      setView((v) => ({ ...v, zoom: Math.min(18, Math.max(9, v.zoom + (e.deltaY < 0 ? 0.5 : -0.5))) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div
      className="plain-map"
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="application"
      aria-label="Map"
    >
      {(meta?.authorities || []).map((a) => {
        const [s, w, n, e] = a.box;
        const p1 = toPx(n, w);
        const p2 = toPx(s, e);
        return (
          <div key={a.id} className="area" style={{ left: p1.x, top: p1.y, width: p2.x - p1.x, height: p2.y - p1.y }}>
            {a.short}
          </div>
        );
      })}
      {markers.map((m) => {
        const p = toPx(m.lat, m.lng);
        if (p.x < -40 || p.y < -40 || p.x > size.w + 40 || p.y > size.h + 40) return null;
        return (
          <div
            key={m.id}
            className="marker"
            style={{ left: p.x, top: p.y, transform: m.center ? 'translate(-50%, -50%)' : undefined }}
            onClick={(e) => {
              e.stopPropagation();
              m.onClick?.();
            }}
          >
            {m.el}
          </div>
        );
      })}
      <div className="zoom">
        <button type="button" className="icon-btn sm locate-btn" onClick={() => setZoom(view.zoom + 1)} aria-label="Zoom in">
          <Plus size={16} strokeWidth={STROKE} />
        </button>
        <button type="button" className="icon-btn sm locate-btn" onClick={() => setZoom(view.zoom - 1)} aria-label="Zoom out">
          <Minus size={16} strokeWidth={STROKE} />
        </button>
      </div>
      <div className="note">{hint || 'Simple map. Add a Google Maps key for street detail.'}</div>
    </div>
  );
}
