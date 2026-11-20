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
    colors: s.types.map((t) => dex.typeColors[t]),
    bst: s.baseStats.hp + s.baseStats.atk + s.baseStats.def + s.baseStats.spd,
    stage: evolved ? 2 : 1,
  };
}
