import { useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Crosshair, MapPin, TriangleAlert, Building2 } from 'lucide-react';
import { useMeta } from '../meta.jsx';
import { getPosition, formatCoords, inBounds } from '../utils.js';
import { STROKE } from '../icons.jsx';
import { PickMap, authorityAt, useMapMode } from './GoogleMap.jsx';
import { Spinner } from './ui.jsx';

// FR6: GPS first, then the resident can fine-tune by tapping the map or dragging the pin.
export default function LocationPicker({ value, onChange, address, onAddress, nearby = [] }) {
  const { meta } = useMeta();
  const mode = useMapMode();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);

  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const p = await getPosition();
      onChange({ ...p, source: 'gps' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
    }
  }

  const council = value && authorityAt(value.lat, value.lng, meta?.authorities);
  const outside = value && meta && !inBounds(value, meta.serviceBounds);

  return (
    <div className="stack">
      <div className="row wrap">
        <button type="button" className="btn btn-sm" onClick={locate} disabled={locating}>
          {locating ? <Spinner size={16} /> : <Crosshair size={16} strokeWidth={STROKE} />}
          {value?.source === 'gps' ? 'Update my location' : 'Use my location'}
        </button>
        <span className="hint">or tap the map{mode === 'google' ? ' and drag the pin' : ''} to set the exact spot.</span>
      </div>
      {error && (
        <div className="error-text">
          <TriangleAlert size={15} strokeWidth={STROKE} /> {error}
        </div>
      )}

      <div className="picker">
        <PickMap value={value} onChange={onChange} others={nearby} />
      </div>

      {value ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row small wrap">
            <MapPin size={15} strokeWidth={STROKE} className="muted" />
            <span>{formatCoords(value)}</span>
            {value.accuracy != null && <span className="tag">GPS accurate to about {value.accuracy} m</span>}
            {value.source === 'map' && <span className="tag">Set on map</span>}
          </div>
          <div className="row small">
            <Building2 size={15} strokeWidth={STROKE} className="muted" />
            {council ? (
              <span>
                Goes to <strong>{council.name}</strong>
              </span>
            ) : (
              <span className="muted">Outside the pilot council areas. Staff will route it by hand.</span>
            )}
          </div>
          {outside && (
            <div className="notice warn small">
              <TriangleAlert size={16} strokeWidth={STROKE} />
              This spot is outside the Klang Valley pilot area. Check the pin is in the right place.
            </div>
          )}
          {value.accuracy > 75 && (
            <div className="notice warn small">
              <TriangleAlert size={16} strokeWidth={STROKE} />
              Your GPS signal is weak. Drag the pin or tap the map to mark the exact spot.
            </div>
          )}
        </div>
      ) : (
        <p className="hint">No location yet.</p>
      )}

      <div className="field">
        <label className="label" htmlFor="address">
          Street or landmark <span className="opt">(optional)</span>
        </label>
        <input
          id="address"
          className="input"
          placeholder="e.g. Jalan Telawi 3, outside the 7-Eleven"
          value={address}
          maxLength={200}
          onChange={(e) => onAddress(e.target.value)}
        />
        {mode === 'google' && value && <ReverseGeocode value={value} onAddress={onAddress} />}
      </div>
    </div>
  );
}

// Fills the address from the pin when Google Maps is available. The resident can still edit it.
function ReverseGeocode({ value, onAddress }) {
  const geocoding = useMapsLibrary('geocoding');
  const [last, setLast] = useState(null);

  useEffect(() => {
    if (!geocoding || !value) return;
    const key = `${value.lat.toFixed(5)},${value.lng.toFixed(5)}`;
    if (key === last) return;
    setLast(key);
    const geocoder = new geocoding.Geocoder();
    geocoder
      .geocode({ location: { lat: value.lat, lng: value.lng } })
      .then(({ results }) => {
        const best = results.find((r) => r.types.includes('street_address') || r.types.includes('route')) || results[0];
        if (best) onAddress(best.formatted_address.replace(/, Malaysia$/, ''));
      })
      .catch(() => {});
  }, [geocoding, value, last, onAddress]);

  return null;
}
