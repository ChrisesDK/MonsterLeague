import { content, type Dex } from '@oml/data';
import type { CreatureArtInput } from './creature';

/** Art inputs for a species, derived from content (types, colours, stats, stage). */
export function artInput(speciesId: string, dex: Dex = content): CreatureArtInput {
  const s = dex.species[speciesId];
  if (!s) throw new Error(`Unknown species "${speciesId}"`);
  const evolved = Object.values(dex.species).some((o) => o.evolution?.into === speciesId);
  return {
    id: s.id,
    types: [...s.types],
    // species colours when the content gives them (M2d), else the type colours
    colors: s.colors ? [...s.colors] : s.types.map((t) => dex.typeColors[t]),
    ring: dex.typeColors[s.types[0]!],
    bst: s.baseStats.hp + s.baseStats.atk + s.baseStats.def + s.baseStats.spd,
    stage: evolved ? 2 : 1,
  };
}
