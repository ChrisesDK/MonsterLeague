/**
 * Region update pipeline (P27, owner request): reads the update queue in docs/REGIONS.md and
 * says, per region, how many updates made in another region are still undecided for it.
 * When a region has ASK_AFTER or more pending updates, it prints the question to put to the
 * owner: which of them should also be brought to that region (not every update should be).
 *
 *   pnpm regions:status
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Ask the owner once this many updates are waiting for one region. */
export const ASK_AFTER = 3;
/** pending: not decided yet · apply / adapt: decided, still to build · done · skip · n/a. */
export const STATUSES = ['pending', 'apply', 'adapt', 'done', 'skip', 'n/a'] as const;
export type Status = (typeof STATUSES)[number];

export interface QueueRow {
  update: string;
  from: string;
  date: string;
  status: Record<string, Status>;
}

/** Parses the "## Update queue" table (columns: Update, From, Date, then one per region). */
export function parseQueue(markdown: string): { regions: string[]; rows: QueueRow[] } {
  const start = markdown.indexOf('## Update queue');
  if (start < 0) throw new Error('docs/REGIONS.md has no "## Update queue" section');
  const end = markdown.indexOf('\n## ', start + 3);
  const lines = markdown
    .slice(start, end < 0 ? undefined : end)
    .split('\n')
    .filter((l) => l.trim().startsWith('|'));
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  const head = cells(lines[0] ?? '');
  if (head.slice(0, 3).join() !== 'Update,From,Date')
    throw new Error(
      `Update queue columns must start with Update | From | Date, got ${head.join(' | ')}`,
    );
  const regions = head.slice(3).map((r) => r.toLowerCase());
  const rows: QueueRow[] = [];
  for (const line of lines.slice(2)) {
    const c = cells(line);
    const status: Record<string, Status> = {};
    regions.forEach((r, i) => {
      // a status may carry a note after it: "skip: no ferry islands"
      const word = (c[3 + i] ?? '').split(/[:\s]/)[0]!.toLowerCase();
      if (!(STATUSES as readonly string[]).includes(word))
        throw new Error(
          `Update "${c[0]}": unknown status "${c[3 + i]}" for ${r} (${STATUSES.join(', ')})`,
        );
      status[r] = word as Status;
    });
    rows.push({ update: c[0]!, from: c[1]!.toLowerCase(), date: c[2]!, status });
  }
  return { regions, rows };
}

function main() {
  const file = fileURLToPath(new URL('../../../docs/REGIONS.md', import.meta.url));
  const { regions, rows } = parseQueue(readFileSync(file, 'utf8'));
  let ask = false;
  for (const r of regions) {
    const pending = rows.filter((x) => x.status[r] === 'pending');
    const todo = rows.filter((x) => x.status[r] === 'apply' || x.status[r] === 'adapt');
    console.log(
      `${r}: ${pending.length} pending decision(s), ${todo.length} decided and still to build`,
    );
    for (const x of todo) console.log(`  to build: ${x.update} (${x.status[r]}, from ${x.from})`);
    if (pending.length >= ASK_AFTER) {
      ask = true;
      console.log(
        `\n→ Ask the owner: should these ${pending.length} updates also come to ${r}? ` +
          `(apply as is, adapt, or skip each)`,
      );
      for (const x of pending) console.log(`  - ${x.update} (from ${x.from}, ${x.date})`);
      console.log('');
    } else if (pending.length > 0)
      console.log(`  (fewer than ${ASK_AFTER} pending: collect a few more before asking)`);
  }
  if (!ask) console.log('\nNothing to ask yet.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
