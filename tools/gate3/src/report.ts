import {
  DENSITY_TARGET_M,
  GATE3_RATING_TARGET,
  mergeGate3,
  parseGate3,
  type Gate3Session,
  type Gate3Summary,
} from '@oml/playtest';

export interface LoadedFile {
  name: string;
  text: string;
}

/** Parses exported Gate 3 .json/.csv files, skipping (and reporting) unreadable ones. */
export function loadGate3Files(files: readonly LoadedFile[]): {
  sessions: Gate3Session[];
  errors: string[];
} {
  const groups: Gate3Session[][] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      groups.push(parseGate3(f.text));
    } catch (err) {
      errors.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { sessions: mergeGate3(groups), errors };
}

const km = (m: number | null) => (m === null ? '—' : `${(m / 1000).toFixed(2)} km`);
const num = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));
const dur = (ms: number | null) => {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function formatGate3(s: Gate3Summary, fileCount: number): string {
  const [gLo] = DENSITY_TARGET_M.green;
  const [, sHi] = DENSITY_TARGET_M.streets;
  const density =
    s.metresPerSpawn === null
      ? ''
      : s.metresPerSpawn >= gLo && s.metresPerSpawn <= sHi
        ? ' ✓'
        : ' ✗';
  const lines = [
    'Odense Monster League — Gate 3 report (district walk test)',
    `${s.sessions} session(s) from ${s.testers} tester(s), ${s.darkSessions} after dark, ${fileCount} file(s)`,
    '',
    `Distance: total ${km(s.totalDistanceM)}, median per session ${km(s.medianDistanceM)}`,
    `Metres per battle-able spawn: ${num(s.metresPerSpawn, 0)} m  (GDD: ${DENSITY_TARGET_M.green.join('–')} m green, ${DENSITY_TARGET_M.streets.join('–')} m streets)${density}`,
    `Battles per km: ${num(s.battlesPerKm)}   catches per km: ${num(s.catchesPerKm)}`,
    `Median leader battle: ${s.medianLeaderTurns ?? '—'} turns (GDD open question: are 30–40 acceptable outdoors?)`,
    `Median active time per battle: wild ${dur(s.medianActiveMs.wild)}, trainer ${dur(s.medianActiveMs.trainer)}, leader ${dur(s.medianActiveMs.leader)}`,
    '',
    `Ratings ("How fun was this walk?", target median ≥ ${GATE3_RATING_TARGET}): median ${s.medianRating ?? '—'}${
      s.medianRating === null ? '' : s.medianRating >= GATE3_RATING_TARGET ? ' ✓' : ' ✗'
    }`,
  ];
  const total = Object.values(s.ratings).reduce((a, b) => a + b, 0);
  for (const r of [5, 4, 3, 2, 1] as const) {
    const n = s.ratings[r];
    lines.push(`  ${r}  ${'█'.repeat(n).padEnd(Math.max(10, total))} ${n}`);
  }
  lines.push('', 'Comments:');
  if (s.comments.length === 0) lines.push('  (none)');
  for (const c of s.comments)
    lines.push(`  [${c.testerCode}${c.dark ? ', dark' : ''}, ${c.rating ?? '—'}/5] ${c.comment}`);
  return lines.join('\n');
}
