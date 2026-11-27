/**
 * Where a creature lives, as a small heat map of the region (owner request for the field
 * guide). Worked out on the phone from the region file and the spawn tables, the same way the
 * spawn rules pick creatures: per map cell, the creature's share of the spawn weight there
 * times the cell's spawn density, day and night together.
 */
import { useEffect, useRef, useState } from 'react';
import type { Dex, RegionId } from '@oml/data';
import { cellDensity, entryWeight, type Region } from '@oml/spawn';
import { cellToLatLng } from 'h3-js';
import { regionGeo } from '../map/regionGeo';
import { loadRegion } from './region';

const W = 320;
const H = 200;

export function spawnHeat(region: Region, speciesId: string, dex: Dex): Map<string, number> {
  const byDistrict = new Map<number, Dex['spawns']>();
  for (const e of dex.spawns) {
    const list = byDistrict.get(e.district) ?? [];
    list.push(e);
    byDistrict.set(e.district, list);
  }
  const heat = new Map<string, number>();
  for (const cell of region.cells.values()) {
    if (cell.noSpawn) continue;
    const entries = byDistrict.get(cell.district);
    if (!entries?.some((e) => e.species === speciesId)) continue;
    let mine = 0;
    let all = 0;
    for (const e of entries) {
      const w = entryWeight(e, cell);
      all += w;
      if (e.species === speciesId) mine += w;
    }
    if (mine > 0 && all > 0) heat.set(cell.id, (mine / all) * cellDensity(cell));
  }
  return heat;
}

export function SpawnHeatMap({
  regionId,
  speciesId,
  dex,
  label,
  emptyLabel,
}: {
  regionId: RegionId;
  speciesId: string;
  dex: Dex;
  label: string;
  /** Said over the map when the creature lives nowhere in the wild. */
  emptyLabel: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  /** No wild home (a starter): the map says so instead of staying blank. */
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    let live = true;
    void loadRegion(regionId).then((r) => live && setRegion(r));
    return () => {
      live = false;
    };
  }, [regionId]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !region) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(canvas);
    const ink = css.getPropertyValue('--line-strong').trim() || '#888';
    const hot = css.getPropertyValue('--accent').trim() || '#c33';
    const land = css.getPropertyValue('--track').trim() || '#ddd';
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // fit the region's outline into the canvas (equirectangular, x scaled by cos(lat))
    const geo = regionGeo(regionId);
    const rings = geo.borders.features
      .filter((f) => f.properties.kind === 'region')
      .map((f) => f.geometry.coordinates);
    const pts = rings.flat();
    const lats = pts.map((p) => p[1]!);
    const lngs = pts.map((p) => p[0]!);
    const [s, n] = [Math.min(...lats), Math.max(...lats)];
    const [w, e] = [Math.min(...lngs), Math.max(...lngs)];
    const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const scale = Math.min((W - 8) / ((e - w) * kx), (H - 8) / (n - s));
    const ox = (W - (e - w) * kx * scale) / 2;
    const oy = (H - (n - s) * scale) / 2;
    const x = (lng: number) => ox + (lng - w) * kx * scale;
    const y = (lat: number) => oy + (n - lat) * scale;

    ctx.fillStyle = land;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    for (const ring of rings) {
      ctx.beginPath();
      ring.forEach(([lng, lat], i) =>
        i ? ctx.lineTo(x(lng!), y(lat!)) : ctx.moveTo(x(lng!), y(lat!)),
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const heat = spawnHeat(region, speciesId, dex);
    const max = Math.max(0, ...heat.values());
    setEmpty(max <= 0);
    if (max <= 0) return;
    const size = Math.max(1.5, scale * 0.0012);
    ctx.fillStyle = hot;
    for (const [id, v] of heat) {
      const [lat, lng] = cellToLatLng(id);
      ctx.globalAlpha = Math.min(1, 0.15 + 0.85 * Math.sqrt(v / max));
      ctx.fillRect(x(lng) - size / 2, y(lat) - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }, [region, regionId, speciesId, dex]);

  return (
    <div className="heat-wrap">
      <canvas
        ref={ref}
        className="heat-map"
        data-testid="guide-heat-map"
        data-ready={region ? 'true' : 'false'}
        role="img"
        aria-label={label}
        style={{ width: W, height: H }}
      />
      {empty && (
        <p className="heat-empty small" data-testid="heat-empty">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}
