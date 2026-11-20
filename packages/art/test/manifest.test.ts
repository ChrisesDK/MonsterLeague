import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { content } from '@oml/data';
import { describe, expect, it } from 'vitest';
import manifestJson from '../assets.json';
import {
  ALLOWED_LICENCES,
  AssetManifestSchema,
  artInput,
  creatureSvg,
  hintMarkerSvg,
  hintMarkerUrl,
  markerSvg,
  markerUrl,
  spriteUrl,
} from '../src/index';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const manifest = AssetManifestSchema.parse(manifestJson);

describe('asset manifest (CI gate)', () => {
  it('has an entry for every species sprite and marker, and every entry has a file', () => {
    for (const id of Object.keys(content.species)) {
      for (const kind of ['sprite', 'marker'] as const) {
        expect(
          manifest.assets.some((a) => a.kind === kind && a.species === id),
          `${kind} ${id}`,
        ).toBe(true);
      }
    }
    for (const a of manifest.assets) expect(existsSync(root(a.file)), a.file).toBe(true);
  });

  it('every generated file is listed (nothing unaccounted for)', () => {
    const files = [
      ...readdirSync(root('generated/sprites')).map((f) => `generated/sprites/${f}`),
      ...readdirSync(root('generated/markers')).map((f) => `generated/markers/${f}`),
      'generated/hint.svg',
    ];
    const listed = new Set(manifest.assets.map((a) => a.file));
    for (const f of files) expect(listed.has(f), f).toBe(true);
  });

  it('only allows the licence allow-list', () => {
    expect([...ALLOWED_LICENCES]).toEqual(['CC0-1.0', 'CC-BY-4.0', 'own', 'artist-licence']);
    for (const a of manifest.assets) expect(ALLOWED_LICENCES).toContain(a.licence);
    expect(() =>
      AssetManifestSchema.parse({ assets: [{ ...manifest.assets[0], licence: 'CC-BY-NC-4.0' }] }),
    ).toThrow();
  });

  it('generated files are up to date with the generator (run pnpm art:build)', () => {
    for (const id of Object.keys(content.species)) {
      expect(readFileSync(root(`generated/sprites/${id}.svg`), 'utf8').trim()).toBe(
        creatureSvg(artInput(id)),
      );
      expect(readFileSync(root(`generated/markers/${id}.svg`), 'utf8').trim()).toBe(
        markerSvg(artInput(id)),
      );
    }
    expect(readFileSync(root('generated/hint.svg'), 'utf8').trim()).toBe(hintMarkerSvg());
  });

  it('accessors refuse sprites without a manifest entry', () => {
    expect(spriteUrl('gnistkat')).toMatch(/^data:image\/svg\+xml/);
    expect(markerUrl('gnistkat')).toMatch(/^data:image\/svg\+xml/);
    expect(hintMarkerUrl()).toMatch(/^data:image\/svg\+xml/);
    expect(() => spriteUrl('not_a_species')).toThrow(/manifest/);
  });
});

describe('generator', () => {
  it('is deterministic and gives each species its own look', () => {
    const svgs = Object.keys(content.species).map((id) => creatureSvg(artInput(id)));
    expect(new Set(svgs).size).toBe(svgs.length);
    expect(creatureSvg(artInput('torvdue'))).toBe(creatureSvg(artInput('torvdue')));
    for (const s of svgs) {
      expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"')).toBe(
        true,
      );
      expect(s).not.toMatch(/NaN|undefined/);
    }
  });

  it('marks evolved forms as stage 2', () => {
    expect(artInput('baalkat').stage).toBe(2);
    expect(artInput('gnistkat').stage).toBe(1);
  });
});
