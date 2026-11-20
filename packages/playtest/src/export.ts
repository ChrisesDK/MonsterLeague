import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  ExportFileSchema,
  PlaytestRecordSchema,
  type ExportFile,
  type PlaytestRecord,
} from './record';

/** CSV column order (one row per battle). */
export const CSV_COLUMNS = [
  'recordId',
  'testerCode',
  'sessionId',
  'battleId',
  'attempt',
  'kind',
  'opponentId',
  'opponentLevel',
  'starter',
  'startedAt',
  'endedAt',
  'activeMs',
  'turns',
  'result',
  'switches',
  'itemsUsed',
  'catchAttempts',
  'speed',
  'locale',
  'appVersion',
  'rating',
  'length',
  'comment',
] as const satisfies readonly (keyof PlaytestRecord)[];

export function toExportFile(records: readonly PlaytestRecord[], exportedAt: Date): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    records: [...records],
  };
}

export function toJson(records: readonly PlaytestRecord[], exportedAt: Date): string {
  return JSON.stringify(toExportFile(records, exportedAt), null, 2);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Keep spreadsheets from treating free text as a formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(records: readonly PlaytestRecord[]): string {
  const rows = [CSV_COLUMNS.join(',')];
  for (const r of records) rows.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(','));
  return `${rows.join('\r\n')}\r\n`;
}

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const NUMBER_COLUMNS = new Set([
  'attempt',
  'opponentLevel',
  'activeMs',
  'turns',
  'switches',
  'itemsUsed',
  'catchAttempts',
  'rating',
]);
const NULLABLE_COLUMNS = new Set(['opponentLevel', 'rating', 'length']);

function recordsFromCsv(text: string): PlaytestRecord[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows.map((cells, n) => {
    const obj: Record<string, unknown> = {};
    header.forEach((col, i) => {
      let value: unknown = cells[i] ?? '';
      if (typeof value === 'string' && /^'[=+\-@\t\r]/.test(value)) value = value.slice(1);
      if (value === '' && NULLABLE_COLUMNS.has(col)) value = null;
      else if (NUMBER_COLUMNS.has(col)) value = Number(value);
      obj[col] = value;
    });
    const parsed = PlaytestRecordSchema.safeParse(obj);
    if (!parsed.success) throw new Error(`CSV row ${n + 2}: ${parsed.error.issues[0]?.message}`);
    return parsed.data;
  });
}

/** Reads an exported .json or .csv file back into records (validated). */
export function parseExport(text: string): PlaytestRecord[] {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) return ExportFileSchema.parse(JSON.parse(trimmed)).records;
  return recordsFromCsv(trimmed);
}
