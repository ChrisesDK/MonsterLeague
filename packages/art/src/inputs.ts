import { content, type Dex } from '@oml/data';
import type { CreatureArtInput } from './creature';

/** Art inputs for a species, derived from content (types, colours, stats, stage). */
export function artInput(speciesId: string, dex: Dex = content): CreatureArtInput {
  const s = dex.species[speciesId];
  if (!s) throw new Error(`Unknown species "${speciesId}"`);
  // stage: how many evolutions lead to this species (0 → 1, 1 → 2, 2 → 3)
  const parent = (id: string) => Object.values(dex.species).find((o) => o.evolution?.into === id);
  const first = parent(speciesId);
  const stage: 1 | 2 | 3 = !first ? 1 : parent(first.id) ? 3 : 2;
  return {
    id: s.id,
    types: [...s.types],
    // species colours when the content gives them (M2d), else the type colours
    colors: s.colors ? [...s.colors] : s.types.map((t) => dex.typeColors[t]),
    ring: dex.typeColors[s.types[0]!],
    bst: s.baseStats.hp + s.baseStats.atk + s.baseStats.def + s.baseStats.spd,
    stage,
  };
}
