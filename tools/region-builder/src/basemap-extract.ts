/**
 * Basemap extract (region v4): copies the vector tiles that cover Odense Kommune (plus a margin
 * for the fog distance) from a Protomaps planet build into apps/client/public/tiles/odense.pmtiles.
 * Does what `pmtiles extract` did before, using the `pmtiles` JS reader and a small PMTiles v3
 * writer, so no extra program is needed.
 *
 *   pnpm --filter @oml/region-builder basemap [YYYYMMDD]   (default: yesterday's build)
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { bboxPolygon, booleanIntersects, buffer } from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { FetchSource, PMTiles, zxyToTileId } from 'pmtiles';
import { REGION } from './config';
import { serializeDirectory, writeHeader, type Entry } from './pmtiles-write';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const OUT = root('apps/client/public/tiles/odense.pmtiles');
/** Tiles further than this from the border are left out (fog distance is at most 1.4 km). */
const MARGIN_KM = 1.6;
const MAX_ZOOM = 15;

const day =
  process.argv[2] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
const url = `https://build.protomaps.com/${day}.pmtiles`;
const src = new PMTiles(new FetchSource(url));
const header = await src.getHeader();
const metadata = await src.getMetadata();
console.log(`Source ${url}: zoom ${header.minZoom}–${header.maxZoom}`);

const boundary = (
  JSON.parse(
    readFileSync(root('packages/data/content/boundary.odense.geojson'), 'utf8'),
  ) as FeatureCollection<MultiPolygon>
).features[0]!;
const area = buffer(boundary, MARGIN_KM, { units: 'kilometers' }) as Feature;

const [west, south, east, north] = REGION.bbox;
const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const x2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const y2lat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

const wanted: { z: number; x: number; y: number; id: number }[] = [];
for (let z = 0; z <= MAX_ZOOM; z++) {
  const [x0, x1] = [lon2x(west, z), lon2x(east, z)];
  const [y0, y1] = [lat2y(north, z), lat2y(south, z)];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      if (z >= 8) {
        const tile = bboxPolygon([x2lon(x, z), y2lat(y + 1, z), x2lon(x + 1, z), y2lat(y, z)]);
        if (!booleanIntersects(tile, area)) continue;
      }
      wanted.push({ z, x, y, id: zxyToTileId(z, x, y) });
    }
}
wanted.sort((a, b) => a.id - b.id);
console.log(`Tiles to copy: ${wanted.length}`);

const data: Buffer[] = new Array(wanted.length);
let next = 0;
let done = 0;
async function worker() {
  while (next < wanted.length) {
    const i = next++;
    const t = wanted[i]!;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await src.getZxy(t.z, t.x, t.y);
        data[i] = r ? gzipSync(Buffer.from(r.data), { level: 9 }) : Buffer.alloc(0);
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
      }
    }
    if (++done % 200 === 0) console.log(`  ${done}/${wanted.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

// Tile data in tile-id order (clustered); identical neighbours share one entry (run length).
const entries: Entry[] = [];
const blobs: Buffer[] = [];
let offset = 0;
for (let i = 0; i < wanted.length; i++) {
  const buf = data[i]!;
  if (buf.length === 0) continue;
  const last = entries[entries.length - 1];
  if (
    last &&
    last.tileId + last.runLength === wanted[i]!.id &&
    blobs[blobs.length - 1]!.equals(buf)
  ) {
    last.runLength++;
    continue;
  }
  entries.push({ tileId: wanted[i]!.id, offset, length: buf.length, runLength: 1 });
  blobs.push(buf);
  offset += buf.length;
}

// Root directory, with leaf directories when the root would not fit in the first 16 KiB.
let rootDir = gzipSync(serializeDirectory(entries));
let leaves = Buffer.alloc(0);
if (127 + rootDir.length > 16_384) {
  const leafParts: Buffer[] = [];
  const rootEntries: Entry[] = [];
  let leafOffset = 0;
  for (let i = 0; i < entries.length; i += 2048) {
    const chunk = entries.slice(i, i + 2048);
    const leaf = gzipSync(serializeDirectory(chunk));
    rootEntries.push({
      tileId: chunk[0]!.tileId,
      offset: leafOffset,
      length: leaf.length,
      runLength: 0,
    });
    leafParts.push(leaf);
    leafOffset += leaf.length;
  }
  rootDir = gzipSync(serializeDirectory(rootEntries));
  leaves = Buffer.concat(leafParts);
}
const meta = gzipSync(Buffer.from(JSON.stringify(metadata)));
const tileData = Buffer.concat(blobs);
const headerBuf = writeHeader({
  rootOffset: 127,
  rootLength: rootDir.length,
  metadataOffset: 127 + rootDir.length,
  metadataLength: meta.length,
  leafOffset: 127 + rootDir.length + meta.length,
  leafLength: leaves.length,
  dataOffset: 127 + rootDir.length + meta.length + leaves.length,
  dataLength: tileData.length,
  addressedTiles: entries.reduce((s, e) => s + e.runLength, 0),
  tileEntries: entries.length,
  tileContents: blobs.length,
  minZoom: 0,
  maxZoom: MAX_ZOOM,
  bbox: REGION.bbox,
  center: [(west + east) / 2, (south + north) / 2],
});
writeFileSync(OUT, Buffer.concat([headerBuf, rootDir, meta, leaves, tileData]));
console.log(
  `Wrote ${OUT}: ${entries.length} entries, ${(tileData.length / 1e6).toFixed(1)} MB of tiles`,
);
