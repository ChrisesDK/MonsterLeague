import { content } from '@oml/data';
import { describe, expect, it } from 'vitest';
import { buildReport, classify, mergeChangeLog } from '../src/report';

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

describe('mergeChangeLog', () => {
  const fresh = '# Balance report\n\n## Summary\n\nx\n\n## 1v1 matrix, level 10\n\nm\n';
  it('keeps the previous change log before the matrices', () => {
    const prev = '# old\n\n## Change log\n\n### v1.1\n- a\n\n## 1v1 matrix, level 10\n\nold\n';
    const merged = mergeChangeLog(prev, fresh);
    expect(merged).toBe(
      '# Balance report\n\n## Summary\n\nx\n\n## Change log\n\n### v1.1\n- a\n\n## 1v1 matrix, level 10\n\nm\n',
    );
  });
  it('is a no-op without a previous file or section', () => {
    expect(mergeChangeLog(null, fresh)).toBe(fresh);
    expect(mergeChangeLog('# nothing', fresh)).toBe(fresh);
    expect(mergeChangeLog('## Change log\n- z', 'no anchor')).toBe(
      'no anchor\n\n## Change log\n- z\n',
    );
  });
});
