/**
 * Content docs (D169), per region (P27): writes docs/regions/<region>/CREATURES.md (every
 * creature, its rarity, evolutions and where it spawns, with small spawn maps in
 * docs/regions/<region>/creatures/) and docs/regions/<region>/TEAMS.md (every arena
 * and trainer team). Generated from the content files, so they never drift: the test in
 * test/docs.test.ts fails when content changes and the docs were not regenerated.
 *
 *   pnpm docs:content
 */
import { readFileSync } from 'node:fs';
import {
  content,
  i18nFor,
  RegionFileSchema,
  regions,
  REGION_IDS,
  type Dex,
  type RegionId,
  type Species,
  type Trainer,
} from '@oml/data';
import { payoutFor } from '@oml/game';
import {
  cellDensity,
  decodeRegion,
  entryWeight,
  MAX_SPAWNS_PER_CELL,
  type Region,
} from '@oml/spawn';

export interface DocFile {
  path: string;
  text: string;
}

/** The texts of the region being written (set by buildRegionDocs). */
let texts = i18nFor('odense');
const en = (key: string, fallback: string) => texts.en[key] ?? fallback;
const da = (key: string, fallback: string) => texts.da[key] ?? fallback;
const speciesName = (id: string) => da(`species.${id}.name`, id);
const zoneName = (id: string) => en(`zone.${id}.name`, id);
const moveName = (id: string) => en(`move.${id}.name`, id);
const itemName = (id: string) => en(`item.${id}.name`, id);
const trainerName = (id: string) => en(`trainer.${id}.name`, id);
const pct = (x: number) => (x === 0 ? '–' : x < 0.001 ? '<0.1 %' : `${(100 * x).toFixed(1)} %`);
const RARITY_LABEL: Record<Species['rarity'], string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  veryRare: 'Very rare',
};
const STARTERS = ['gnistkat', 'aaodder', 'boegling'];

export function loadRegion(region: RegionId = 'odense'): Region {
  const file = RegionFileSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(`../../../packages/data/region/${region}/region.json`, import.meta.url),
        'utf8',
      ),
    ),
  );
  return decodeRegion(file);
}

// ---------------------------------------------------------------- spawn statistics

interface SpawnStats {
  /** Expected spawns per window, by species, in destinations and elsewhere (day/night mean). */
  dest: Map<string, number>;
  other: Map<string, number>;
  destTotal: number;
  otherTotal: number;
  /** Expected spawns per window by species and zone. */
  byZone: Map<string, Map<string, number>>;
  /** Expected spawns per window in each zone's destination cells (all species). */
  zoneDest: Map<string, number>;
  /** Expected spawns per window that need a field ability, by species. */
  ability: Map<string, number>;
}

/**
 * Exact expectations, no sampling: in each cell a window holds min(density, 3) spawns, split
 * over the cell's table entries by weight (D167 rules: destination-only entries, rare boost).
 * Day and night count half each.
 */
export function spawnStats(region: Region, dex: Dex = content): SpawnStats {
  const s: SpawnStats = {
    dest: new Map(),
    other: new Map(),
    destTotal: 0,
    otherTotal: 0,
    byZone: new Map(),
    zoneDest: new Map(),
    ability: new Map(),
  };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const cell of region.cells.values()) {
    if (cell.noSpawn) continue;
    const n = Math.min(MAX_SPAWNS_PER_CELL, cellDensity(cell));
    if (n <= 0) continue;
    for (const night of [false, true]) {
      const entries = dex.spawns.filter(
        (e) => e.district === cell.district && (e.time === 'any' || (e.time === 'night') === night),
      );
      const w = entries.map((e) => entryWeight(e, cell));
      const total = w.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      entries.forEach((e, i) => {
        const x = (0.5 * n * w[i]!) / total;
        if (x === 0) return;
        if (e.requires) {
          add(s.ability, e.species, x);
          return;
        }
        add(cell.destination ? s.dest : s.other, e.species, x);
        if (cell.destination) {
          s.destTotal += x;
          add(s.zoneDest, cell.zone, x);
        } else s.otherTotal += x;
        if (!s.byZone.has(e.species)) s.byZone.set(e.species, new Map());
        add(s.byZone.get(e.species)!, cell.zone, x);
      });
    }
  }
  return s;
}

// ---------------------------------------------------------------- maps

interface Projector {
  w: number;
  h: number;
  xy: (lng: number, lat: number) => [number, number];
  outline: string;
}

function projector(width: number, region: RegionId): Projector {
  const geo = JSON.parse(
    readFileSync(
      new URL(`../../../packages/data/content/${region}/boundary.geojson`, import.meta.url),
      'utf8',
    ),
  ) as { features: { geometry: { type: string; coordinates: number[][][][] | number[][][] } }[] };
  const g = geo.features[0]!.geometry;
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
  const pts = polys.flat(2);
  const lngs = pts.map((p) => p[0]!);
  const lats = pts.map((p) => p[1]!);
  const [w0, e0, s0, n0] = [
    Math.min(...lngs),
    Math.max(...lngs),
    Math.min(...lats),
    Math.max(...lats),
  ];
  const kx = Math.cos((((s0 + n0) / 2) * Math.PI) / 180);
  const pad = 6;
  const scale = (width - 2 * pad) / ((e0 - w0) * kx);
  const h = Math.round((n0 - s0) * scale + 2 * pad);
  const xy = (lng: number, lat: number): [number, number] => [
    Math.round((pad + (lng - w0) * kx * scale) * 10) / 10,
    Math.round((pad + (n0 - lat) * scale) * 10) / 10,
  ];
  const outline = polys
    .map((poly) =>
      poly
        .map((ring) => {
          let last = '';
          const parts: string[] = [];
          for (const [lng, lat] of ring) {
            const [x, y] = xy(lng!, lat!);
            const k = `${Math.round(x)},${Math.round(y)}`;
            if (k === last) continue;
            last = k;
            parts.push(k);
          }
          return `M${parts.join('L')}Z`;
        })
        .join(''),
    )
    .join('');
  return { w: width, h, xy, outline };
}

const ZONE_FILL: Record<string, string> = {
  wild: '#4f8a3c',
  water: '#2f7fb5',
  town: '#8a8073',
  arena: '#b8860b',
};

function speciesMap(p: Projector, byZone: Map<string, number> | undefined, dex: Dex): string {
  const total = [...(byZone?.values() ?? [])].reduce((a, b) => a + b, 0);
  const dots = Object.values(dex.zones)
    .map((z) => {
      const share = total > 0 ? (byZone?.get(z.id) ?? 0) / total : 0;
      const [x, y] = p.xy(z.lng, z.lat);
      if (share < 0.005) return `<circle cx="${x}" cy="${y}" r="1.6" fill="#b9b2a6"/>`;
      const r = Math.max(2.5, Math.sqrt(share) * 22).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${ZONE_FILL[z.kind]}" fill-opacity="0.75" stroke="#fff" stroke-width="0.8"><title>${zoneName(z.id)}: ${(100 * share).toFixed(0)} %</title></circle>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.w} ${p.h}" width="${p.w}" height="${p.h}"><path d="${p.outline}" fill="#f3efe4" stroke="#d4a017" stroke-width="1.5" fill-rule="evenodd"/>${dots}</svg>\n`;
}

function overviewMap(p: Projector, dex: Dex): string {
  const zones = Object.values(dex.zones)
    .map((z) => {
      const [x, y] = p.xy(z.lng, z.lat);
      const label = zoneName(z.id).replace(/&/g, '&amp;');
      return `<circle cx="${x}" cy="${y}" r="5" fill="${ZONE_FILL[z.kind]}" stroke="#fff" stroke-width="1"/><text x="${x + 7}" y="${y + 3.5}" font-size="10" font-family="sans-serif" fill="#2b2b2b">${label}${z.arena ? ` (arena ${z.arena})` : ''}</text>`;
    })
    .join('');
  const legend = (
    [
      ['wild', 'forest or field destination'],
      ['water', 'lake destination'],
      ['town', 'town'],
      ['arena', 'arena zone'],
    ] as const
  )
    .map(
      ([k, t], i) =>
        `<circle cx="14" cy="${p.h - 64 + i * 15}" r="5" fill="${ZONE_FILL[k]}"/><text x="24" y="${p.h - 60 + i * 15}" font-size="11" font-family="sans-serif">${t}</text>`,
    )
    .join('');
  const w = p.w + 110; // room for the labels on the east edge
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${p.h}" width="${w}" height="${p.h}"><path d="${p.outline}" fill="#f3efe4" stroke="#d4a017" stroke-width="2" fill-rule="evenodd"/>${zones}${legend}</svg>\n`;
}

// ---------------------------------------------------------------- CREATURES.md

function lines(dex: Dex): Species[][] {
  const all = Object.values(dex.species);
  const isEvolved = new Set(all.flatMap((s) => (s.evolution ? [s.evolution.into] : [])));
  return all
    .filter((s) => !isEvolved.has(s.id))
    .map((first) => {
      const chain = [first];
      while (chain.at(-1)!.evolution) chain.push(dex.species[chain.at(-1)!.evolution!.into]!);
      return chain;
    });
}

const bst = (s: Species) => s.baseStats.hp + s.baseStats.atk + s.baseStats.def + s.baseStats.spd;

function creaturesDoc(region: Region, dex: Dex): DocFile[] {
  const stats = spawnStats(region, dex);
  const p = projector(260, dex.region);
  const big = projector(720, dex.region);
  const dir = `docs/regions/${dex.region}`;
  const files: DocFile[] = [{ path: `${dir}/creatures/overview.svg`, text: overviewMap(big, dex) }];
  const all = lines(dex);
  const wild = all.filter((l) => !STARTERS.includes(l[0]!.id));
  const starters = all.filter((l) => STARTERS.includes(l[0]!.id));
  const out: string[] = [];
  out.push(
    '# Creatures',
    '',
    '<!-- Generated by `pnpm docs:content` (tools/docs) from the content files. Do not edit by hand. -->',
    '',
    `${Object.keys(dex.species).length} creatures in ${all.length} evolution lines: ${starters.length} starter lines and ${wild.length} wild lines (roster v2, D167). Rarity decides how often a creature appears; the spawn tables follow it (\`packages/data/content/${dex.region}/spawns.json\`).`,
    '',
    "**Chance at its main home** is the share of the creatures in that destination's nature that are this species: what a player standing there sees. Destination creatures (D171) spawn only in their 1–3 home destinations, most at the main home. **Spawn chance** is the share of all wild creatures (no field ability needed) that are this species, computed exactly from the spawn rules over the whole region, day and night counted half each. **Destinations** are real nature (forest, park, meadow, field or water) in the forest, field and lake zones on the Town Map: spawns there are about 2.3 times as dense as in streets and rare creatures 3 times as likely (D167). Common and uncommon creatures appear at the player's own level; rare and very rare ones at their district's level and only once their zone is open.",
    '',
    '![Zones of Odense](creatures/overview.svg)',
    '',
    '## Wild lines',
    '',
    '| # | Line (evolves at level) | Types | Rarity | Spawn chance in destinations | Spawn chance elsewhere | Chance at its main home | Where | Map |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  const lineRows: string[] = [];
  const speciesRows: string[] = [];
  wild.forEach((line, i) => {
    const first = line[0]!;
    const chain = line
      .map((s, k) =>
        k === 0 ? speciesName(s.id) : `${speciesName(s.id)} (${line[k - 1]!.evolution!.level})`,
      )
      .join(' → ');
    const entries = dex.spawns.filter((e) => e.species === first.id);
    const plain = entries.filter((e) => !e.requires);
    const districts = [...new Set(plain.map((e) => e.district))].sort((a, b) => a - b);
    const destOnly = plain.length > 0 && plain.every((e) => e.destinationOnly);
    const times = [...new Set(plain.map((e) => e.time))];
    const biomes = Object.entries(plain[0]?.biomes ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([b]) => b);
    const zones = [...(stats.byZone.get(first.id)?.entries() ?? [])].sort((a, b) => b[1] - a[1]);
    const zoneTotal = zones.reduce((a, [, v]) => a + v, 0);
    const top = zones
      .slice(0, 3)
      .map(([z, v]) => `${zoneName(z)} ${Math.round((100 * v) / zoneTotal)} %`)
      .join(', ');
    const ability = [...new Set(entries.filter((e) => e.requires).map((e) => e.requires))];
    // D171: destination creatures live only in their home destinations, main home first
    const spawnsIn = (z: string) => stats.byZone.get(first.id)?.get(z) ?? 0;
    const homes = [...new Set(plain.flatMap((e) => e.zones ?? []))].sort(
      (a, b) => spawnsIn(b) - spawnsIn(a),
    );
    const where = [
      destOnly && homes.length
        ? `**only at ${homes.map((z, k) => (k === 0 ? `${zoneName(z)} (main home)` : zoneName(z))).join(', ')}**`
        : destOnly
          ? '**destinations only**'
          : null,
      homes.length ? null : `districts ${districts.join(', ')}`,
      times.includes('night') ? 'night' : times.includes('day') ? 'day' : null,
      `likes ${biomes.join(', ')}`,
      ability.length ? `also with ${ability.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('; ');
    const svg = `${dir}/creatures/${first.id}.svg`;
    files.push({ path: svg, text: speciesMap(p, stats.byZone.get(first.id), dex) });
    lineRows.push(
      `| ${i + 1} | ${chain} | ${first.types.join('/')} | ${RARITY_LABEL[first.rarity]} | ${pct((stats.dest.get(first.id) ?? 0) / stats.destTotal)} | ${pct((stats.other.get(first.id) ?? 0) / stats.otherTotal)} | ${homes.length ? `${pct((stats.byZone.get(first.id)?.get(homes[0]!) ?? 0) / (stats.zoneDest.get(homes[0]!) ?? 1))} at ${zoneName(homes[0]!)}` : '–'} | ${where}. Most in: ${top || '–'} | [map](creatures/${first.id}.svg) |`,
    );
    speciesRows.push(...line.map((s) => speciesRow(s)));
  });
  out.push(...lineRows, '');
  out.push(
    '## Spawn maps',
    '',
    "Circles sit on zone centres; their area shows the share of the line's spawns in that zone (green: forest or field, blue: lake, grey: town, gold: arena zone).",
    '',
  );
  const cells = wild.map(
    (l) =>
      `<td align="center"><img src="creatures/${l[0]!.id}.svg" width="200" alt=""><br>${speciesName(l[0]!.id)} (${RARITY_LABEL[l[0]!.rarity].toLowerCase()})</td>`,
  );
  out.push('<table>');
  for (let i = 0; i < cells.length; i += 4) out.push(`<tr>${cells.slice(i, i + 4).join('')}</tr>`);
  out.push('</table>', '');
  out.push(
    '## Starter lines',
    '',
    'Chosen at the start; never wild.',
    '',
    '| Line (evolves at level) | Types |',
    '|---|---|',
    ...starters.map(
      (line) =>
        `| ${line.map((s, k) => (k === 0 ? speciesName(s.id) : `${speciesName(s.id)} (${line[k - 1]!.evolution!.level})`)).join(' → ')} | ${line.map((s) => s.types.join('/')).join(' → ')} |`,
    ),
    '',
  );
  out.push(
    '## Every creature',
    '',
    '| Creature | id | Types | Rarity | Base stats (HP/Atk/Def/Spd = total) | Catch rate | Evolves | Moves learned (level) |',
    '|---|---|---|---|---|---|---|---|',
    ...starters.flatMap((l) => l.map((s) => speciesRow(s))),
    ...speciesRows,
    '',
  );
  out.push(
    '## Spawn tables by district',
    '',
    'Weight is the table weight before biome fit; "rare" entries use the district\'s level band. Destination-only entries never appear outside destinations.',
    '',
  );
  for (let d = 1; d <= 8; d++) {
    const band = dex.districtBands[d]!;
    out.push(
      `### District ${d}: ${en(`district.${d}.name`, String(d))} (levels ${band[0]}–${band[1]})`,
      '',
      '| Creature | Weight | Level band | Time | Biomes | Only in destinations | Needs |',
      '|---|---|---|---|---|---|---|',
      ...dex.spawns
        .filter((e) => e.district === d)
        .map(
          (e) =>
            `| ${speciesName(e.species)} | ${e.weight} | ${e.rarity === 'rare' ? 'district' : "player's"} | ${e.time} | ${Object.entries(
              e.biomes,
            )
              .map(([b, v]) => `${b} ${v}`)
              .join(', ')} | ${e.destinationOnly ? 'yes' : ''} | ${e.requires ?? ''} |`,
        ),
      '',
    );
  }
  files.push({ path: `${dir}/CREATURES.md`, text: out.join('\n') });
  return files;
}

function speciesRow(s: Species): string {
  const b = s.baseStats;
  const evo = s.evolution ? `${speciesName(s.evolution.into)} at ${s.evolution.level}` : '–';
  const moves = s.learnset.map((l) => `${moveName(l.moveId)} (${l.level})`).join(', ');
  return `| ${speciesName(s.id)} | \`${s.id}\` | ${s.types.join('/')} | ${RARITY_LABEL[s.rarity]} | ${b.hp}/${b.atk}/${b.def}/${b.spd} = ${bst(s)} | ${s.catchRate} | ${evo} | ${moves} |`;
}

// ---------------------------------------------------------------- TEAMS.md

function team(t: Trainer): string {
  return t.team
    .map(
      (m) =>
        `${speciesName(m.speciesId)} ${m.level}${m.moves ? ` (${m.moves.map(moveName).join(', ')})` : ''}`,
    )
    .join(', ');
}
const reward = (t: Trainer) =>
  [t.reward ? `${t.reward.count}× ${itemName(t.reward.itemId)}` : null, `${payoutFor(t)} coins`]
    .filter(Boolean)
    .join(' + ');
const bag = (items: Record<string, number>) =>
  Object.entries(items)
    .map(([id, n]) => `${n}× ${itemName(id)}`)
    .join(', ') || '–';

function teamsDoc(dex: Dex): DocFile {
  const out: string[] = [
    '# Arena and trainer teams',
    '',
    '<!-- Generated by `pnpm docs:content` (tools/docs) from the content files. Do not edit by hand. -->',
    '',
    'Every arena and trainer team in the game (`trainers.json` in the region content folder, placed by its `pois.json`). Leader levels are tuned so the expected player team (`player-teams.json`) wins 40–60 % neutral, 75–90 % with type advantage and 15–30 % with disadvantage (see [BALANCE.md](../../BALANCE.md)). Coins are paid on the first win: the highest level × 25, × 60 for leaders (D165).',
    '',
    '## Arenas',
    '',
  ];
  const pois = Object.values(dex.pois);
  for (const site of dex.arenaSites) {
    const poi = pois.find((p) => p.kind === 'arena' && p.arena === site.arena);
    const band = dex.districtBands[site.district]!;
    out.push(
      `### Arena ${site.arena}: ${en(`arenaSite.${site.arena}.name`, site.zone)} (${site.type ?? 'mixed'})`,
      '',
      `Zone ${zoneName(site.zone)}, district ${site.district} (wild levels ${band[0]}–${band[1]}). Badge: ${en(`badge.${site.arena}.name`, '')}. Needs badge ${site.arena - 1 || '–'}.`,
      '',
      '| Order | Trainer | Team | Items | Reward |',
      '|---|---|---|---|---|',
    );
    if (poi?.kind === 'arena')
      poi.trainers.forEach((id, i) => {
        const t = dex.trainers[id]!;
        out.push(
          `| ${i + 1} | ${trainerName(id)} (\`${id}\`) | ${team(t)} | ${bag(t.items)} | ${reward(t)} |`,
        );
      });
    const preset = Object.values(dex.playerTeams).find((x) => x.arena === site.arena);
    if (preset)
      out.push(
        '',
        `Expected player team (balance sim): starter at ${preset.starterLevel}, ${preset.team
          .map((m) => `${speciesName(m.speciesId)} ${m.level}`)
          .join(', ')}; items ${bag(preset.items)}.`,
      );
    out.push('');
  }
  out.push(
    '## Route trainers',
    '',
    'Ordered by route. Routes open the zones at both ends when walked (P22).',
    '',
  );
  const routes = Object.values(dex.routes).sort((a, b) => a.number - b.number);
  for (const r of routes) {
    const here = pois.filter((p) => p.kind === 'trainer' && p.route === r.id);
    out.push(
      `### Route ${r.number}: ${zoneName(r.from)} – ${zoneName(r.to)} (${r.kind}, ${(r.lengthM / 1000).toFixed(1)} km)`,
      '',
      '| Trainer | Team | Reward |',
      '|---|---|---|',
      ...here.map((p) => {
        const t = dex.trainers[p.kind === 'trainer' ? p.trainer : '']!;
        return `| ${trainerName(t.id)} (\`${t.id}\`) | ${team(t)} | ${reward(t)} |`;
      }),
      '',
    );
  }
  const placed = new Set(
    pois.flatMap((p) =>
      p.kind === 'trainer' ? [p.trainer] : p.kind === 'arena' ? p.trainers : [],
    ),
  );
  const offRoute = pois.filter((p) => p.kind === 'trainer' && !p.route);
  if (offRoute.length)
    out.push(
      '## Other placed trainers',
      '',
      '| Trainer | Zone | Team | Reward |',
      '|---|---|---|---|',
      ...offRoute.map((p) => {
        const t = dex.trainers[p.kind === 'trainer' ? p.trainer : '']!;
        return `| ${trainerName(t.id)} (\`${t.id}\`) | ${zoneName(p.zone)} | ${team(t)} | ${reward(t)} |`;
      }),
      '',
    );
  const unplaced = Object.values(dex.trainers).filter((t) => !placed.has(t.id));
  if (unplaced.length)
    out.push(
      '## Not placed on the map',
      '',
      'Content that exists but has no point of interest (used by tests, the sim or the dev page).',
      '',
      '| Trainer | Team |',
      '|---|---|',
      ...unplaced.map((t) => `| \`${t.id}\` | ${team(t)} |`),
      '',
    );
  return { path: `docs/regions/${dex.region}/TEAMS.md`, text: out.join('\n') };
}

/** The docs of one region (its own folder, texts and region file). */
// ---------------------------------------------------------------- region map (README)

const ROUTE_STYLE: Record<string, string> = {
  main: 'stroke="#c0392b" stroke-width="3"',
  alt: 'stroke="#d9772e" stroke-width="2"',
  explore: 'stroke="#4f8a3c" stroke-width="2" stroke-dasharray="6 4"',
  ferry: 'stroke="#2f7fb5" stroke-width="2" stroke-dasharray="1.5 5" stroke-linecap="round"',
};

/** The region at a glance (D179): border, routes by kind, ferry crossings dotted, zones, arenas. */
function regionMap(p: Projector, dex: Dex): string {
  const routes = Object.values(dex.routes)
    .map((r) => {
      const d = r.path
        .map(([lng, lat], i) => `${i ? 'L' : 'M'}${p.xy(lng, lat).join(',')}`)
        .join('');
      return `<path d="${d}" fill="none" ${ROUTE_STYLE[r.kind]}><title>${en(`route.${r.id}.name`, r.id)}</title></path>`;
    })
    .join('');
  const zones = Object.values(dex.zones)
    .map((z) => {
      const [x, y] = p.xy(z.lng, z.lat);
      const label = zoneName(z.id).replace(/&/g, '&amp;');
      const mark = z.arena
        ? `<circle cx="${x}" cy="${y}" r="8" fill="#b8860b" stroke="#fff" stroke-width="1.5"/><text x="${x}" y="${y + 3.5}" font-size="10" font-weight="bold" text-anchor="middle" fill="#fff" font-family="sans-serif">${z.arena}</text>`
        : `<circle cx="${x}" cy="${y}" r="4" fill="${ZONE_FILL[z.kind]}" stroke="#fff" stroke-width="1"/>`;
      return `${mark}<text x="${x + 9}" y="${y + 3.5}" font-size="9" font-family="sans-serif" fill="#2b2b2b">${label}</text>`;
    })
    .join('');
  const legend = (
    [
      ['main', 'badge path'],
      ['alt', 'other way'],
      ['explore', 'to a destination'],
      ['ferry', 'ferry crossing'],
    ] as const
  )
    .map(
      ([k, t], i) =>
        `<path d="M10 ${p.h - 58 + i * 15} h22" ${ROUTE_STYLE[k]} fill="none"/><text x="38" y="${p.h - 54 + i * 15}" font-size="11" font-family="sans-serif">${t}</text>`,
    )
    .join('');
  const w = p.w + 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${p.h}" width="${w}" height="${p.h}"><rect width="${w}" height="${p.h}" fill="#eaf2f7"/><path d="${p.outline}" fill="#f3efe4" stroke="#d4a017" stroke-width="2" fill-rule="evenodd"/>${routes}${zones}${legend}</svg>\n`;
}

/** docs/regions/<region>/README.md: the region's map, zones and routes. */
function regionReadme(dex: Dex): DocFile[] {
  const dir = `docs/regions/${dex.region}`;
  const routes = Object.values(dex.routes).sort((a, b) => a.number - b.number);
  const km = (m: number) => (m / 1000).toFixed(1);
  const walk = routes.filter((r) => r.kind !== 'ferry');
  const out = [
    `# ${en(`municipality.${dex.region}.name`, dex.region)}`,
    '',
    '<!-- Generated by `pnpm docs:content` (tools/docs) from the content files. Do not edit by hand. -->',
    '',
    `Region \`${dex.region}\`: ${Object.keys(dex.zones).length} zones in 8 districts, ${walk.length} walking routes (${km(walk.reduce((a, r) => a + r.lengthM, 0))} km)${routes.length > walk.length ? `, ${routes.length - walk.length} ferry crossings` : ''}, ${dex.arenaSites.length} arenas, ${Object.keys(dex.species).length} creatures, ${Object.keys(dex.trainers).length} trainers. State and features: [REGIONS.md](../../REGIONS.md).`,
    '',
    '![Map](map.svg)',
    '',
    '## Arenas',
    '',
    '| # | Site | Zone | Theme | Badge |',
    '| --- | --- | --- | --- | --- |',
    ...dex.arenaSites.map(
      (a) =>
        `| ${a.arena} | ${en(`arenaSite.${a.arena}.name`, '')} | ${zoneName(a.zone)} | ${a.type ?? 'mixed'} | ${en(`badge.${a.arena}.name`, '')} |`,
    ),
    '',
    '## Zones',
    '',
    '| Zone | id | Kind | District | Notes |',
    '| --- | --- | --- | --- | --- |',
    ...Object.values(dex.zones)
      .sort((a, b) => a.district - b.district || a.id.localeCompare(b.id))
      .map(
        (z) =>
          `| ${zoneName(z.id)} | \`${z.id}\` | ${z.kind}${z.icon ? ` (${z.icon})` : ''} | ${z.district} | ${[z.start ? 'start' : '', z.arena ? `arena ${z.arena}` : '', z.opensOnArrival ? 'ferry island: opens on arrival' : ''].filter(Boolean).join(', ')} |`,
      ),
    '',
    '## Routes',
    '',
    '| # | From | To | Kind | Length | Wild |',
    '| --- | --- | --- | --- | --- | --- |',
    ...routes.map(
      (r) =>
        `| ${r.number} | ${zoneName(r.from)} | ${zoneName(r.to)} | ${r.kind} | ${km(r.lengthM)} km | ${r.kind === 'ferry' ? '–' : `${Math.round(r.wildShare * 100)} %`} |`,
    ),
    '',
  ];
  return [
    { path: `${dir}/README.md`, text: out.join('\n') },
    { path: `${dir}/map.svg`, text: regionMap(projector(760, dex.region), dex) },
  ];
}

export function buildRegionDocs(dex: Dex = content): DocFile[] {
  texts = i18nFor(dex.region);
  return [...regionReadme(dex), ...creaturesDoc(loadRegion(dex.region), dex), teamsDoc(dex)];
}

/** The docs of every region. */
export function buildDocs(): DocFile[] {
  return REGION_IDS.flatMap((r) => buildRegionDocs(regions[r]));
}
