import {
  RATING_TARGET,
  mergeRecords,
  parseExport,
  type Gate2Summary,
  type PlaytestRecord,
} from '@oml/playtest';

export interface LoadedFile {
  name: string;
  text: string;
}

export interface LoadResult {
  records: PlaytestRecord[];
  errors: string[];
}

/** Parses exported .json/.csv files, skipping (and reporting) unreadable ones. */
export function loadFiles(files: readonly LoadedFile[]): LoadResult {
  const groups: PlaytestRecord[][] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      groups.push(parseExport(f.text));
    } catch (err) {
      errors.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { records: mergeRecords(groups), errors };
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const mark = (ok: boolean | null) => (ok === null ? '' : ok ? ' ✓' : ' ✗');

export function formatSummary(s: Gate2Summary, fileCount: number): string {
  const lines = [
    'Odense Monster League — Gate 2 report',
    `${s.records} battles from ${s.testers} tester(s), ${s.sessions} session(s), ${fileCount} file(s)`,
    '',
    'Median active time per battle kind (target):',
  ];
  for (const [kind, k] of Object.entries(s.byKind)) {
    lines.push(
      `  ${kind.padEnd(8)} ${formatDuration(k.medianActiveMs).padStart(6)}  (< ${formatDuration(k.targetMs)})${mark(k.withinTarget)}` +
        `   n=${k.battles}  median turns ${k.medianTurns ?? '—'}  median rating ${k.medianRating ?? '—'}` +
        `  too long ${k.length.too_long} / right ${k.length.about_right} / too short ${k.length.too_short}`,
    );
  }
  const total = Object.values(s.ratings).reduce((a, b) => a + b, 0);
  lines.push('', `Ratings ("How fun was that battle?", target median ≥ ${RATING_TARGET}):`);
  for (const r of [5, 4, 3, 2, 1] as const) {
    const n = s.ratings[r];
    lines.push(`  ${r}  ${'█'.repeat(n).padEnd(Math.max(10, total))} ${n}`);
  }
  lines.push(
    `  mean ${s.meanRating === null ? '—' : s.meanRating.toFixed(2)}  median ${s.medianRating ?? '—'}${mark(
      s.medianRating === null ? null : s.medianRating >= RATING_TARGET,
    )}  unrated ${s.unrated}`,
    '',
    `Length: too long ${s.length.too_long} · about right ${s.length.about_right} · too short ${s.length.too_short}`,
  );
  if (s.comments.length) {
    lines.push('', 'Comments:');
    for (const c of s.comments)
      lines.push(
        `  [${c.testerCode} ${c.battleId} ★${c.rating ?? '–'}] ${c.comment.replace(/\s+/g, ' ')}`,
      );
  }
  return lines.join('\n');
}
