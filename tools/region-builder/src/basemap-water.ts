import { open } from 'node:fs/promises';
import { VectorTile } from '@mapbox/vector-tile';
import type { Feature, Geometry } from 'geojson';
import Pbf from 'pbf';
import { PMTiles, type RangeResponse, type Source } from 'pmtiles';

/** Reads a local .pmtiles file through the PMTiles Source interface. */
class FileSource implements Source {
  constructor(private path: string) {}
  getKey() {
    return this.path;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const fh = await open(this.path, 'r');
    try {
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
    } finally {
      await fh.close();
    }
  }
}

const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tile = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * Water polygons from the Protomaps basemap's `water` layer (sea and harbour basins built
 * from the OSM coastline, plus lakes and river areas). The Overpass query can't give us
 * the sea, because Danish harbours are bounded by coastline lines, not water polygons.
 */
export async function basemapWater(
  file: string,
  [west, south, east, north]: [number, number, number, number],
  zoom = 15,
): Promise<Feature<Geometry>[]> {
  const pm = new PMTiles(new FileSource(file));
  const out: Feature<Geometry>[] = [];
  for (let x = lon2tile(west, zoom); x <= lon2tile(east, zoom); x++) {
    for (let y = lat2tile(north, zoom); y <= lat2tile(south, zoom); y++) {
      const tile = await pm.getZxy(zoom, x, y);
      if (!tile) continue;
      const layer = new VectorTile(new Pbf(new Uint8Array(tile.data))).layers.water;
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (f.type !== 3) continue; // polygons only
        const geo = f.toGeoJSON(x, y, zoom) as Feature<Geometry>;
        geo.properties = { natural: 'water', basemap_kind: String(f.properties.kind ?? '') };
        out.push(geo);
      }
    }
  }
  return out;
}
