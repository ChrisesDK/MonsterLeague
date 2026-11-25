/** Minimal PMTiles v3 writer helpers (spec: github.com/protomaps/PMTiles/blob/main/spec/v3). */

export interface Entry {
  tileId: number;
  offset: number;
  length: number;
  /** 0 = the entry points to a leaf directory. */
  runLength: number;
}

function varint(out: number[], n: number) {
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

/** Directory bytes (uncompressed): count, tile-id deltas, run lengths, lengths, offsets. */
export function serializeDirectory(entries: readonly Entry[]): Buffer {
  const out: number[] = [];
  varint(out, entries.length);
  let last = 0;
  for (const e of entries) {
    varint(out, e.tileId - last);
    last = e.tileId;
  }
  for (const e of entries) varint(out, e.runLength);
  for (const e of entries) varint(out, e.length);
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    if (i > 0 && prev && e.offset === prev.offset + prev.length) varint(out, 0);
    else varint(out, e.offset + 1);
  });
  return Buffer.from(out);
}

export interface HeaderFields {
  rootOffset: number;
  rootLength: number;
  metadataOffset: number;
  metadataLength: number;
  leafOffset: number;
  leafLength: number;
  dataOffset: number;
  dataLength: number;
  addressedTiles: number;
  tileEntries: number;
  tileContents: number;
  minZoom: number;
  maxZoom: number;
  bbox: [number, number, number, number];
  center: [number, number];
}

/** The fixed 127-byte header: clustered, gzip directories and tiles, MVT tiles. */
export function writeHeader(h: HeaderFields): Buffer {
  const b = Buffer.alloc(127);
  b.write('PMTiles', 0, 'ascii');
  b.writeUInt8(3, 7);
  const u64 = (v: number, at: number) => b.writeBigUInt64LE(BigInt(v), at);
  u64(h.rootOffset, 8);
  u64(h.rootLength, 16);
  u64(h.metadataOffset, 24);
  u64(h.metadataLength, 32);
  u64(h.leafOffset, 40);
  u64(h.leafLength, 48);
  u64(h.dataOffset, 56);
  u64(h.dataLength, 64);
  u64(h.addressedTiles, 72);
  u64(h.tileEntries, 80);
  u64(h.tileContents, 88);
  b.writeUInt8(1, 96); // clustered
  b.writeUInt8(2, 97); // internal compression: gzip
  b.writeUInt8(2, 98); // tile compression: gzip
  b.writeUInt8(1, 99); // tile type: MVT
  b.writeUInt8(h.minZoom, 100);
  b.writeUInt8(h.maxZoom, 101);
  const e7 = (v: number, at: number) => b.writeInt32LE(Math.round(v * 1e7), at);
  e7(h.bbox[0], 102);
  e7(h.bbox[1], 106);
  e7(h.bbox[2], 110);
  e7(h.bbox[3], 114);
  b.writeUInt8(0, 118);
  e7(h.center[0], 119);
  e7(h.center[1], 123);
  return b;
}
