import { beforeEach, describe, expect, it, vi } from 'vitest';

// The protocol handler maplibre would call, and every pmtiles Protocol made.
let handler: (p: { url: string }, a: AbortController) => Promise<unknown>;
const made: { tilev4: ReturnType<typeof vi.fn> }[] = [];
let failNext = false;
vi.mock('maplibre-gl', () => ({
  default: { addProtocol: (_: string, h: typeof handler) => (handler = h) },
}));
vi.mock('pmtiles', () => ({
  Protocol: class {
    tilev4 = vi.fn(async () => {
      if (failNext) {
        failNext = false;
        throw new Error('network');
      }
      return { data: 'ok' };
    });
    constructor() {
      made.push(this);
    }
  },
}));

describe('pmtiles protocol (owner bug: blank maps after the background)', () => {
  beforeEach(() => vi.resetModules());
  it('a failed read starts the caches over; an aborted one does not', async () => {
    made.length = 0;
    const { ensureTiles } = await import('../src/map/tiles');
    ensureTiles();
    const first = made.length;
    await expect(handler({ url: 'pmtiles://x' }, new AbortController())).resolves.toEqual({
      data: 'ok',
    });
    failNext = true;
    await expect(handler({ url: 'pmtiles://x' }, new AbortController())).rejects.toThrow('network');
    expect(made.length).toBe(first + 1); // a fresh Protocol for the next read
    const aborted = new AbortController();
    aborted.abort();
    failNext = true;
    await expect(handler({ url: 'pmtiles://x' }, aborted)).rejects.toThrow();
    expect(made.length).toBe(first + 1);
  });
  it('resetTiles makes a fresh one too', async () => {
    made.length = 0;
    const { resetTiles } = await import('../src/map/tiles');
    const before = made.length;
    resetTiles();
    expect(made.length).toBe(before + 1);
  });
});
