import type { Dex } from './index';
import { MUNICIPALITIES, REGION_ID_PREFIX } from './municipalities';
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

  for (const t of Object.values(dex.trainers)) {
    if (t.reward && !dex.items[t.reward.itemId])
      errors.push(`trainer ${t.id}: reward item "${t.reward.itemId}" does not exist`);
  }

  for (const p of Object.values(dex.pois)) {
    const where = `poi ${p.id}`;
    if (p.kind === 'trainer') {
      const t = dex.trainers[p.trainer];
      if (!t) errors.push(`${where}: trainer "${p.trainer}" does not exist`);
      else if (t.tier !== 'trainer')
        errors.push(`${where}: "${p.trainer}" is a leader; use an arena POI`);
    } else if (p.kind === 'arena') {
      p.trainers.forEach((id, i) => {
        const t = dex.trainers[id];
        const last = i === p.trainers.length - 1;
        if (!t) errors.push(`${where}: trainer "${id}" does not exist`);
        else if (last && (t.tier !== 'leader' || t.arena !== p.arena))
          errors.push(`${where}: the last trainer must be the arena ${p.arena} leader`);
        else if (!last && t.tier !== 'trainer')
          errors.push(`${where}: junior "${id}" must be a trainer, not a leader`);
      });
      if (p.trainers.length > 3) errors.push(`${where}: GDD allows 1–2 junior trainers`);
    } else if (p.kind === 'restStop') {
      for (const itemId of Object.keys(p.restock))
        if (!dex.items[itemId]) errors.push(`${where}: restock item "${itemId}" does not exist`);
    }
  }
  const usedTrainers = Object.values(dex.pois).flatMap((p) =>
    p.kind === 'trainer' ? [p.trainer] : p.kind === 'arena' ? p.trainers : [],
  );
  if (new Set(usedTrainers).size !== usedTrainers.length)
    errors.push('pois: a trainer is placed twice');

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
    if (sp.district < 1 || sp.district > 8) errors.push(`spawn ${i}: district ${sp.district}`);
    if (!Object.values(sp.biomes).some((v) => v > 0))
      errors.push(`spawn ${i}: needs a positive biome preference`);
    const sp2 = dex.species[sp.species];
    if (
      sp2?.evolution === undefined &&
      Object.values(dex.species).some((o) => o.evolution?.into === sp.species)
    )
      errors.push(`spawn ${i}: "${sp.species}" is an evolved form; wild spawns use first stages`);
    if (sp.requires && !dex.fieldAbilities[sp.requires])
      errors.push(`spawn ${i}: field ability "${sp.requires}" does not exist`);
    for (const zid of sp.zones ?? []) {
      const z = dex.zones[zid];
      if (!z) errors.push(`spawn ${i}: zone "${zid}" does not exist`);
      else if (z.kind !== 'wild' && z.kind !== 'water')
        errors.push(`spawn ${i}: zone "${zid}" is not a destination (forest, field or lake)`);
      else if (z.district !== sp.district)
        errors.push(`spawn ${i}: zone "${zid}" is in district ${z.district}, not ${sp.district}`);
    }
    if (sp.zones && !sp.destinationOnly)
      errors.push(`spawn ${i}: entries with zones must be destinationOnly`);
  });

  // D171 (owner request): a destination creature spawns only in its 1–3 home destinations,
  // every entry of it (field-ability layers too), with one main home where it is commonest.
  const destSpecies = new Set(dex.spawns.filter((e) => e.destinationOnly).map((e) => e.species));
  for (const s of destSpecies) {
    const entries = dex.spawns.filter((e) => e.species === s);
    if (entries.some((e) => !e.zones))
      errors.push(`spawns: ${s} is a destination creature, so every entry needs home zones`);
    const byZone = new Map<string, number>();
    for (const e of entries.filter((x) => !x.requires))
      for (const z of e.zones ?? []) byZone.set(z, (byZone.get(z) ?? 0) + e.weight);
    if (byZone.size < 1 || byZone.size > 3)
      errors.push(`spawns: ${s} has ${byZone.size} home destinations (1–3)`);
    const top = Math.max(...byZone.values());
    if ([...byZone.values()].filter((w) => w === top).length !== 1)
      errors.push(`spawns: ${s} needs one main home (a single highest weight)`);
  }

  errors.push(...checkWorld(dex));
  return errors;
}

/** M2d: arena sites, routes and Journal side goals refer to real content. */
function checkWorld(dex: Dex): string[] {
  const errors: string[] = [];
  dex.arenaSites.forEach((a, i) => {
    if (a.arena !== i + 1) errors.push(`arenas: expected arena ${i + 1}, got ${a.arena}`);
    if (a.district !== a.arena)
      errors.push(`arenas: arena ${a.arena} must be in district ${a.arena}`);
    if (a.poi !== null) {
      const poi = dex.pois[a.poi];
      if (!poi || poi.kind !== 'arena' || poi.arena !== a.arena)
        errors.push(`arenas: arena ${a.arena}: poi "${a.poi}" is not arena ${a.arena}'s POI`);
      else if (Math.hypot((poi.lat - a.lat) * 110_540, (poi.lng - a.lng) * 63_300) > 5)
        errors.push(`arenas: arena ${a.arena} site is not at its POI`);
    }
  });
  for (const p of Object.values(dex.pois))
    if (p.kind === 'arena' && dex.arenaSites[p.arena - 1]?.poi !== p.id)
      errors.push(`arenas: arena ${p.arena} site must link its POI "${p.id}"`);
  // Zones (P22): one start zone, one arena zone per arena in its own district.
  const zones = Object.values(dex.zones);
  if (zones.filter((z) => z.start).length !== 1) errors.push('zones: exactly one start zone');
  for (let n = 1; n <= 8; n++) {
    const az = zones.filter((z) => z.arena === n);
    if (az.length !== 1) errors.push(`zones: arena ${n} needs exactly one zone`);
    else if (az[0]!.district !== n || az[0]!.kind !== 'arena')
      errors.push(`zones: ${az[0]!.id} must be an arena zone in district ${n}`);
  }
  for (const z of zones)
    if ((z.kind === 'arena') !== (z.arena !== undefined))
      errors.push(`zones: ${z.id}: only arena zones have an arena`);
  dex.arenaSites.forEach((a) => {
    const z = dex.zones[a.zone];
    if (!z || z.arena !== a.arena)
      errors.push(`arenas: arena ${a.arena} must be in its arena zone`);
  });
  for (const p of Object.values(dex.pois)) {
    const z = dex.zones[p.zone];
    if (!z) errors.push(`pois: ${p.id}: unknown zone "${p.zone}"`);
    else if (z.district !== p.district)
      errors.push(`pois: ${p.id}: district ${p.district} is not its zone's (${z.district})`);
    if (p.kind === 'arena' && z && z.arena !== p.arena)
      errors.push(`pois: ${p.id}: arena ${p.arena} must stand in its arena zone`);
  }
  // Routes (P22): numbered 1…n, between two different zones; every zone is reachable.
  const numbers = new Set<number>();
  const links = new Map<string, string[]>();
  for (const r of Object.values(dex.routes)) {
    const want = `${REGION_ID_PREFIX[dex.region] ?? ''}route${r.number}`;
    if (r.id !== want) errors.push(`routes: id ${r.id} must be ${want}`);
    if (numbers.has(r.number)) errors.push(`routes: duplicate route number ${r.number}`);
    numbers.add(r.number);
    for (const end of [r.from, r.to])
      if (!dex.zones[end]) errors.push(`routes: ${r.id}: unknown zone "${end}"`);
    if (r.from === r.to) errors.push(`routes: ${r.id} must link two zones`);
    links.set(r.from, [...(links.get(r.from) ?? []), r.to]);
    links.set(r.to, [...(links.get(r.to) ?? []), r.from]);
  }
  const start = zones.find((z) => z.start);
  if (start && Object.keys(dex.routes).length > 0) {
    const seen = new Set([start.id]);
    const queue = [start.id];
    while (queue.length > 0) {
      for (const n of links.get(queue.shift()!) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    for (const z of zones)
      if (!seen.has(z.id)) errors.push(`routes: no route reaches zone ${z.id}`);
  }
  const typesIn = (d: number) =>
    new Set(
      dex.spawns
        .filter((e) => e.district === d && e.rarity === 'common' && !e.requires)
        .flatMap((e) => dex.species[e.species]?.types ?? []),
    );
  for (const g of dex.sideGoals) {
    const where = `goals: ${g.id}`;
    if (g.kind === 'catchType' && !typesIn(g.district).has(g.type))
      errors.push(`${where}: no common ${g.type} creature spawns in district ${g.district}`);
    if (
      g.kind === 'findRare' &&
      !dex.spawns.some(
        (e) =>
          e.district === g.district &&
          e.species === g.species &&
          e.rarity === 'rare' &&
          !e.requires,
      )
    )
      errors.push(`${where}: ${g.species} is not a rare spawn in district ${g.district}`);
  }
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
    ...Object.keys(dex.pois).map((p) => `poi.${p}.name`),
    ...dex.arenaSites.map((a) => `arenaSite.${a.arena}.name`),
    ...Object.keys(dex.routes).map((r) => `route.${r}.name`),
    ...Object.keys(dex.zones).map((z) => `zone.${z}.name`),
    ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [`district.${n}.name`, `badge.${n}.name`]),
    ...MUNICIPALITIES.map((m) => `municipality.${m}.name`),
    // Trainers placed on the map need their pre- and post-battle lines.
    ...Object.values(dex.pois).flatMap((p) =>
      (p.kind === 'trainer' ? [p.trainer] : p.kind === 'arena' ? p.trainers : []).flatMap((id) => [
        `trainer.${id}.intro`,
        `trainer.${id}.defeated`,
      ]),
    ),
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

/** Text keys that belong to a region (its own i18n/<region>/ files), not to the shared UI. */
export const REGION_TEXT_PREFIXES = [
  'species',
  'trainer',
  'poi',
  'district',
  'badge',
  'arenaSite',
  'zone',
  'route',
] as const;
const ID_KEYS = new Set(['species', 'trainer', 'poi', 'zone', 'route']);

/**
 * P27: regions never overlap or mix. Every id in a region starts with the region's prefix
 * (Odense keeps unprefixed ids, and none of them may start with another region's prefix);
 * no id is used by two regions; region texts live only in the region's own files and only
 * name that region's ids; the shared texts hold no region texts.
 */
export function checkSeparation(
  dexes: Record<string, Dex>,
  shared: Record<string, I18nTable>,
  perRegion: Record<string, Record<string, I18nTable>>,
): string[] {
  const errors: string[] = [];
  const ids = (d: Dex): [string, string][] => [
    ...Object.keys(d.species).map((i) => ['species', i] as [string, string]),
    ...Object.keys(d.trainers).map((i) => ['trainer', i] as [string, string]),
    ...Object.keys(d.pois).map((i) => ['poi', i] as [string, string]),
    ...Object.keys(d.zones).map((i) => ['zone', i] as [string, string]),
    ...Object.keys(d.routes).map((i) => ['route', i] as [string, string]),
    ...Object.keys(d.playerTeams).map((i) => ['player team', i] as [string, string]),
    ...d.sideGoals.map((g) => ['goal', g.id] as [string, string]),
  ];
  const owner = new Map<string, string>();
  const prefixes = Object.entries(REGION_ID_PREFIX).filter(([, p]) => p) as [string, string][];
  for (const [region, d] of Object.entries(dexes)) {
    const prefix = REGION_ID_PREFIX[region as keyof typeof REGION_ID_PREFIX] ?? '';
    for (const [kind, id] of ids(d)) {
      if (prefix && !id.startsWith(prefix))
        errors.push(`${region}: ${kind} "${id}" must start with "${prefix}"`);
      for (const [other, p] of prefixes)
        if (other !== region && id.startsWith(p))
          errors.push(`${region}: ${kind} "${id}" uses ${other}'s prefix "${p}"`);
      const key = `${kind}:${id}`;
      const first = owner.get(key);
      if (first && first !== region)
        errors.push(`${kind} "${id}" is in both ${first} and ${region}`);
      else owner.set(key, region);
    }
  }
  // region texts are "<kind>.<id>.<field>" (zone.centrum.name) or numbered (badge.1.name);
  // two-part keys like trainer.battle are shared UI
  const regionKey = (key: string) =>
    (REGION_TEXT_PREFIXES as readonly string[]).includes(key.split('.')[0]!) &&
    key.split('.').length >= 3;
  for (const [locale, table] of Object.entries(shared))
    for (const key of Object.keys(table))
      if (regionKey(key))
        errors.push(`shared ${locale} text "${key}" belongs in a region's text file`);
  for (const [region, locales] of Object.entries(perRegion)) {
    const d = dexes[region];
    for (const [locale, table] of Object.entries(locales))
      for (const key of Object.keys(table)) {
        if (shared[locale]?.[key] !== undefined)
          errors.push(`${region} ${locale} text "${key}" is also a shared text`);
        const [kind, id, field] = key.split('.');
        if (d && kind && id && field && ID_KEYS.has(kind)) {
          const known =
            kind === 'species'
              ? d.species[id]
              : kind === 'trainer'
                ? d.trainers[id]
                : kind === 'poi'
                  ? d.pois[id]
                  : kind === 'zone'
                    ? d.zones[id]
                    : d.routes[id];
          if (!known)
            errors.push(`${region} ${locale} text "${key}" names no ${kind} of ${region}`);
        }
      }
  }
  return errors;
}
