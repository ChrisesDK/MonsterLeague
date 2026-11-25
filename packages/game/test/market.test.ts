import { content } from '@oml/data';
import { describe, expect, it } from 'vitest';
import {
  buyItem,
  chooseStarter,
  loadSave,
  marketStock,
  newSave,
  payoutFor,
  sellItem,
  sellPrice,
  type SaveGame,
} from '../src/index';

const SEED = '0123456789abcdef0123456789abcdef';
const rich = (coins: number): SaveGame => ({ ...chooseStarter(newSave(SEED), 'gnistkat'), coins });

describe('skilling and markets (D165)', () => {
  it('trainers pay their highest level × 25, leaders × 60', () => {
    expect(payoutFor(content.trainers.route1_lise!)).toBe(5 * 25);
    expect(payoutFor(content.trainers.leader_folk!)).toBe(10 * 60);
  });

  it('a market sells priced items; Good and Great Charms need badges 2 and 5', () => {
    const stock = marketStock({ badges: [] });
    expect(stock).toContain('basic_charm');
    expect(stock).toContain('medium_tonic');
    expect(stock).toContain('revive_blossom');
    expect(stock).not.toContain('good_charm');
    expect(marketStock({ badges: [1, 2] })).toContain('good_charm');
    expect(marketStock({ badges: [1, 2] })).not.toContain('great_charm');
    expect(marketStock({ badges: [1, 2, 3, 4, 5] })).toContain('great_charm');
  });

  it('buying costs the price; not enough skilling or a badge-gated item: nothing happens', () => {
    const s = rich(250);
    const before = s.bag.basic_charm ?? 0;
    const bought = buyItem(s, 'basic_charm')!;
    expect(bought.coins).toBe(150);
    expect(bought.bag.basic_charm).toBe(before + 1);
    expect(buyItem(rich(50), 'basic_charm')).toBeNull();
    expect(buyItem(rich(9999), 'good_charm')).toBeNull();
    expect(buyItem(rich(9999), 'nope')).toBeNull();
  });

  it('selling pays half the price and removes the item when the last one goes', () => {
    const s = { ...rich(0), bag: { revive_leaf: 1 } };
    expect(sellPrice('revive_leaf')).toBe(400);
    const sold = sellItem(s, 'revive_leaf')!;
    expect(sold.coins).toBe(400);
    expect(sold.bag.revive_leaf).toBeUndefined();
    expect(sellItem(sold, 'revive_leaf')).toBeNull();
  });

  it('v9 → v10: trainers already beaten pay out', () => {
    const { coins: _c, ...rest } = chooseStarter(newSave(SEED), 'gnistkat');
    const v9 = { ...rest, version: 9, defeatedTrainers: ['route1_lise', 'leader_folk'] };
    const r = loadSave(JSON.parse(JSON.stringify(v9)), 'x');
    expect(r.ok && r.save.coins).toBe(125 + 600);
  });
});
