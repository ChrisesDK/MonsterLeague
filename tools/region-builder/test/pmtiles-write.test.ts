import { gzipSync } from 'node:zlib';
import { PMTiles, zxyToTileId, type RangeResponse, type Source } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import { serializeDirectory, writeHeader, type Entry } from '../src/pmtiles-write';

/** An in-memory PMTiles source for the official reader. */
class BufferSource implements Source {
  constructor(private readonly buf: Buffer) {}
  getKey() {
    return 'mem';
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const b = this.buf.subarray(offset, offset + length);
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer };
  }
}

describe('PMTiles v3 writer (basemap extract)', () => {
  it('writes an archive the pmtiles reader can open, with run-length entries', async () => {
    const tiles: [number, number, number, string][] = [
      [0, 0, 0, 'world'],
      [1, 1, 0, 'a'],
      [1, 1, 1, 'b'],
    ];
    const entries: Entry[] = [];
    const blobs: Buffer[] = [];
    let offset = 0;
    for (const [z, x, y, text] of tiles.sort(
      (p, q) => zxyToTileId(p[0], p[1], p[2]) - zxyToTileId(q[0], q[1], q[2]),
    )) {
      const blob = gzipSync(Buffer.from(text));
      entries.push({ tileId: zxyToTileId(z, x, y), offset, length: blob.length, runLength: 1 });
      blobs.push(blob);
      offset += blob.length;
    }
    const root = gzipSync(serializeDirectory(entries));
    const meta = gzipSync(Buffer.from(JSON.stringify({ name: 'test' })));
    const data = Buffer.concat(blobs);
    const header = writeHeader({
      rootOffset: 127,
      rootLength: root.length,
      metadataOffset: 127 + root.length,
      metadataLength: meta.length,
      leafOffset: 127 + root.length + meta.length,
      leafLength: 0,
      dataOffset: 127 + root.length + meta.length,
      dataLength: data.length,
      addressedTiles: 3,
      tileEntries: 3,
      tileContents: 3,
      minZoom: 0,
      maxZoom: 1,
      bbox: [10.17, 55.28, 10.59, 55.49],
      center: [10.38, 55.385],
    });
    expect(header.length).toBe(127);
    const p = new PMTiles(new BufferSource(Buffer.concat([header, root, meta, data])));
    const h = await p.getHeader();
    expect(h.specVersion).toBe(3);
    expect([h.minZoom, h.maxZoom]).toEqual([0, 1]);
    expect(h.minLon).toBeCloseTo(10.17, 5);
    expect(h.maxLat).toBeCloseTo(55.49, 5);
    expect(await p.getMetadata()).toEqual({ name: 'test' });
    for (const [z, x, y, text] of tiles) {
      const t = await p.getZxy(z, x, y);
      expect(Buffer.from(t!.data).toString()).toBe(text);
    }
    expect(await p.getZxy(1, 0, 0)).toBeUndefined();
  });
});
