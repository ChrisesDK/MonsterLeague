import manifestJson from '../assets.json';
import { creatureSvg, hintMarkerSvg, markerSvg } from './creature';
import { artInput } from './inputs';
import { AssetManifestSchema, type AssetEntry } from './manifest';

export { creatureSvg, hintMarkerSvg, markerSvg } from './creature';
export type { CreatureArtInput } from './creature';
export { artInput } from './inputs';
export {
  ALLOWED_LICENCES,
  AssetEntrySchema,
  AssetManifestSchema,
  type AssetEntry,
} from './manifest';

const manifest = AssetManifestSchema.parse(manifestJson);

/** Every sprite in use must have a manifest entry (GDD: source and licence recorded). */
function entry(kind: AssetEntry['kind'], species: string | null): AssetEntry {
  const found = manifest.assets.find((a) => a.kind === kind && a.species === species);
  if (!found) throw new Error(`No asset-manifest entry for ${kind} ${species ?? ''}`.trim());
  return found;
}

const toDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const cache = new Map<string, string>();
const cached = (key: string, make: () => string) => {
  let v = cache.get(key);
  if (!v) cache.set(key, (v = make()));
  return v;
};

/** Battle sprite (128×128 viewBox) as a data URL. */
export function spriteUrl(speciesId: string): string {
  entry('sprite', speciesId);
  return cached(`s:${speciesId}`, () => toDataUrl(creatureSvg(artInput(speciesId))));
}

/** Map marker (64×76 viewBox, pointer at the bottom centre) as a data URL. */
export function markerUrl(speciesId: string): string {
  entry('marker', speciesId);
  return cached(`m:${speciesId}`, () => toDataUrl(markerSvg(artInput(speciesId))));
}

/** "Rustling" hint marker for spawns that need a field ability (species hidden). */
export function hintMarkerUrl(): string {
  entry('hint', null);
  return cached('hint', () => toDataUrl(hintMarkerSvg()));
}
