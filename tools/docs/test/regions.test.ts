import { readFileSync } from 'node:fs';
import { REGION_IDS } from '@oml/data';
import { describe, expect, it } from 'vitest';
import { parseQueue } from '../src/regions-status';

describe('region update queue (P27)', () => {
  const md = readFileSync(new URL('../../../docs/REGIONS.md', import.meta.url), 'utf8');
  const { regions, rows } = parseQueue(md);

  it('has a status column for every region', () => {
    expect([...regions].sort()).toEqual([...REGION_IDS].sort());
  });

  it('every update is done in the region it was built in', () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(['shared', ...REGION_IDS], r.update).toContain(r.from);
      if (r.from !== 'shared') expect(r.status[r.from], r.update).toBe('done');
      expect(r.date, r.update).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
