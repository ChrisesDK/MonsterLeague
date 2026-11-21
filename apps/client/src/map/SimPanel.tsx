import { useEffect, useMemo, useState } from 'react';
import { content } from '@oml/data';
import type { Translate } from '../i18n';
import { parseGpx, type SimLocation, type SimState } from './location';
import sampleGpx from './sample-walk.gpx?raw';

interface Props {
  t: Translate;
  sim: SimLocation;
  useSim: boolean;
  onUseSim: (on: boolean) => void;
  onTeleportMode: (on: boolean) => void;
}

/** Dev GPS simulator controls (dev builds and #/dev/map only). */
export function SimPanel({ t, sim, useSim, onUseSim, onTeleportMode }: Props) {
  const [state, setState] = useState<SimState>(sim.state);
  const [teleport, setTeleport] = useState(false);
  const [open, setOpen] = useState(false);
  /** Sample GPX walk, or one of the live routes (M2d: walk a route with the simulator). */
  const walks = useMemo(
    () => [
      { id: 'sample', label: t('sim.sample'), points: parseGpx(sampleGpx) },
      ...Object.values(content.routes)
        .filter((r) => !r.draft)
        .map((r) => ({
          id: r.id,
          label: t(`route.${r.id}.name`),
          points: r.path.map(([lng, lat]) => ({ lat, lng })),
        })),
    ],
    [t],
  );
  const [walkId, setWalkId] = useState('sample');
  const route = walks.find((w) => w.id === walkId)!.points;

  useEffect(() => {
    sim.onChange = setState;
    return () => {
      sim.onChange = undefined;
    };
  }, [sim]);

  useEffect(() => {
    onTeleportMode(teleport && useSim);
  }, [teleport, useSim, onTeleportMode]);

  return (
    <div
      className={`sim-panel${open ? '' : ' collapsed'}`}
      aria-label={t('sim.title')}
      data-testid="sim-panel"
    >
      <button
        type="button"
        className="btn small-btn sim-toggle"
        data-testid="sim-toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? t('sim.hide') : t('sim.show')}
      </button>
      <label className="sim-row">
        <input type="checkbox" checked={useSim} onChange={(e) => onUseSim(e.target.checked)} />
        <span>{useSim ? t('sim.on') : t('sim.real')}</span>
      </label>
      {useSim && (
        <>
          <div className="sim-row">
            <button
              className={`btn small-btn${teleport ? ' on' : ''}`}
              onClick={() => setTeleport(!teleport)}
            >
              {t('sim.teleport')}
            </button>
          </div>
          <div className="sim-row">
            <select
              aria-label={t('sim.route')}
              data-testid="sim-walk"
              value={walkId}
              onChange={(e) => setWalkId(e.target.value)}
            >
              {walks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sim-row">
            {state.mode === 'walking' ? (
              <button className="btn small-btn" onClick={() => sim.stop()}>
                {t('sim.stop')}
              </button>
            ) : (
              <button className="btn small-btn" onClick={() => sim.walk(route, state.speedFactor)}>
                {t('sim.walk')}
              </button>
            )}
            <select
              aria-label={t('sim.speed')}
              value={state.speedFactor}
              onChange={(e) => sim.setSpeedFactor(Number(e.target.value))}
            >
              {[1, 5, 20].map((f) => (
                <option key={f} value={f}>
                  ×{f}
                </option>
              ))}
            </select>
          </div>
          <label className="sim-row">
            <input
              type="checkbox"
              checked={state.fakeFast}
              onChange={(e) => sim.setFakeFast(e.target.checked)}
            />
            <span>{t('sim.fast')}</span>
          </label>
          <div className="sim-pos" data-testid="sim-pos">
            {state.position.lat.toFixed(5)}, {state.position.lng.toFixed(5)}
          </div>
        </>
      )}
    </div>
  );
}
