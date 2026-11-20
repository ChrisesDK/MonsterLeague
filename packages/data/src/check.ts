import type { Dex } from './index';
import type { I18nTable } from './schemas';
import { TYPE_IDS } from './schemas';

/** The fallback move every creature uses when it is out of PP. */
export const FALLBACK_MOVE_ID = 'desperate_swing';

/** GDD "XP": level cap 50 in Odense. Content (trainers, presets) must stay at or below it. */
export const ODENSE_LEVEL_CAP = 50;

/** Cross-reference checks the Zod schemas cannot express. Returns a list of errors. */
export function checkContent(dex: Dex): string[] {
  const errors: string[] = [];

  // Type matrix must be complete.
  for (const t of TYPE_IDS) {
    if (!dex.typeIds.includes(t)) errors.push(`types: missing type "${t}"`);
    const row = dex.chart[t];
    if (!row) {
      errors.push(`types.chart: missing attacker row "${t}"`);
      continue;
    }
    for (const d of TYPE_IDS) {
      if (row[d] === undefined) errors.push(`types.chart: missing entry ${t} → ${d}`);
    }
  }

  if (!dex.moves[FALLBACK_MOVE_ID])
    errors.push(`moves: missing fallback move "${FALLBACK_MOVE_ID}"`);

  for (const m of Object.values(dex.moves)) {
    if (m.power === 0 && m.effects.length === 0)
      errors.push(`move ${m.id}: status move without effects`);
    if (m.power === 0 && m.effects.some((e) => e.kind === 'recoil'))
      errors.push(`move ${m.id}: status move cannot have recoil`);
  }

  for (const s of Object.values(dex.species)) {
    const where = `species ${s.id}`;
    const bst = s.baseStats.hp + s.baseStats.atk + s.baseStats.def + s.baseStats.spd;
    if (bst < 240 || bst > 400) errors.push(`${where}: base stat total ${bst} outside 240–400`);
    if (new Set(s.types).size !== s.types.length) errors.push(`${where}: duplicate type`);
    if (!s.learnset.some((l) => l.level === 1))
      errors.push(`${where}: learnset has no level-1 move`);
    for (const l of s.learnset) {
      if (!dex.moves[l.moveId]) errors.push(`${where}: learnset move "${l.moveId}" does not exist`);
      if (l.moveId === FALLBACK_MOVE_ID) errors.push(`${where}: fallback move in learnset`);
      if (l.level > 50) errors.push(`${where}: learnset level ${l.level} above 50`);
    }
    const levels = s.learnset.map((l) => l.level);
    if (levels.some((lv, i) => i > 0 && lv < levels[i - 1]!))
      errors.push(`${where}: learnset not sorted by level`);
    if (s.evolution && !dex.species[s.evolution.into])
      errors.push(`${where}: evolution target "${s.evolution.into}" does not exist`);
  }

  for (const t of Object.values(dex.trainers)) {
    const where = `trainer ${t.id}`;
    for (const member of t.team) {
      if (member.level > ODENSE_LEVEL_CAP)
        errors.push(`${where}: level ${member.level} above the Odense cap ${ODENSE_LEVEL_CAP}`);
      const sp = dex.species[member.speciesId];
      if (!sp) errors.push(`${where}: species "${member.speciesId}" does not exist`);
      for (const mv of member.moves ?? []) {
        if (!dex.moves[mv]) errors.push(`${where}: move "${mv}" does not exist`);
      }
    }
    for (const itemId of Object.keys(t.items)) {
      if (!dex.items[itemId]) errors.push(`${where}: item "${itemId}" does not exist`);
    }
  }

  const arenas = new Map<number, string>();
  for (const t of Object.values(dex.trainers)) {
    if (t.tier !== 'leader') continue;
    if (t.arena === undefined) errors.push(`trainer ${t.id}: leaders need an arena`);
    else if (arenas.has(t.arena))
      errors.push(`trainer ${t.id}: arena ${t.arena} already has a leader`);
    else arenas.set(t.arena, t.id);
  }

  for (const p of Object.values(dex.playerTeams)) {
    for (const m of p.team) {
      if (m.level > ODENSE_LEVEL_CAP)
        errors.push(`player team ${p.id}: level ${m.level} above the cap`);
      if (!dex.species[m.speciesId])
        errors.push(`player team ${p.id}: species "${m.speciesId}" does not exist`);
    }
    for (const itemId of Object.keys(p.items)) {
      if (!dex.items[itemId]) errors.push(`player team ${p.id}: item "${itemId}" does not exist`);
    }
    const leader = arenas.get(p.arena);
    if (!leader) errors.push(`player team ${p.id}: arena ${p.arena} has no leader`);
    // Starter + preset team = one creature more than the leader.
    else if (p.team.length !== dex.trainers[leader]!.team.length)
      errors.push(
        `player team ${p.id}: must have one creature more than ${leader} (starter + ${dex.trainers[leader]!.team.length})`,
      );
  }

  // GDD: each badge (2–7) unlocks exactly one field ability.
  const badges = new Map<number, string>();
  for (const f of Object.values(dex.fieldAbilities)) {
    const other = badges.get(f.badge);
    if (other) errors.push(`field ability ${f.id}: badge ${f.badge} already unlocks "${other}"`);
    badges.set(f.badge, f.id);
    if (new Set(f.types).size !== f.types.length)
      errors.push(`field ability ${f.id}: duplicate type`);
  }

  dex.spawns.forEach((sp, i) => {
    if (!dex.species[sp.species]) errors.push(`spawn ${i}: species "${sp.species}" does not exist`);
    if (sp.requires && !dex.fieldAbilities[sp.requires])
      errors.push(`spawn ${i}: field ability "${sp.requires}" does not exist`);
  });

  return errors;
}

/** Every content id needs a name in every locale, and locales must have identical keys. */
export function checkI18n(dex: Dex, tables: Record<string, I18nTable>): string[] {
  const errors: string[] = [];
  const required = [
    ...dex.typeIds.flatMap((t) => [`type.${t}.name`, `type.${t}.icon`]),
    ...Object.keys(dex.species).map((s) => `species.${s}.name`),
    ...Object.keys(dex.moves).map((m) => `move.${m}.name`),
    ...Object.keys(dex.items).flatMap((i) => [`item.${i}.name`, `item.${i}.desc`]),
    ...Object.keys(dex.trainers).map((t) => `trainer.${t}.name`),
    ...Object.keys(dex.fieldAbilities).map((f) => `fieldAbility.${f}.name`),
  ];
  const locales = Object.keys(tables);
  for (const locale of locales) {
    const table = tables[locale]!;
    for (const key of required) {
      if (!table[key]) errors.push(`i18n ${locale}: missing key "${key}"`);
    }
    for (const other of locales) {
      if (other === locale) continue;
      for (const key of Object.keys(table)) {
        if (!(key in tables[other]!))
          errors.push(`i18n ${other}: missing key "${key}" (present in ${locale})`);
      }
    }
  }
  return errors;
}
