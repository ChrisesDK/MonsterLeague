import { content } from '@oml/data';
import { describe, expect, it } from 'vitest';
import { buildReport, classify } from '../src/report';

describe('balance report', () => {
  it('classifies starter vs leader theme', () => {
    expect(classify('grove', 'water', content)).toBe('advantage');
    expect(classify('fire', 'water', content)).toBe('disadvantage');
    expect(classify('water', 'water', content)).toBe('neutral');
    expect(classify('fire', 'folk', content)).toBe('neutral');
    expect(classify('fire', undefined, content)).toBe('neutral');
  });

  it('builds all sections (small sample)', () => {
    const r = buildReport({ pairN: 2, teamN: 4, seed: 1 });
    expect(r.markdown).toMatch(/## Summary/);
    expect(r.markdown).toMatch(/## 1v1 matrix, level 10/);
    expect(r.markdown).toMatch(/## 1v1 matrix, level 25/);
    expect(r.teams.length).toBeGreaterThanOrEqual(6);
    const n = Object.keys(content.species).length;
    expect(r.matrices[10]).toHaveLength(n);
    expect(r.flags.some((f) => f.startsWith('ERROR'))).toBe(false);
  });
});
