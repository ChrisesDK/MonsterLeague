import { i18n } from '@oml/data';
import { chooseAiAction, createCreature, resolveTurn, type BattleEvent } from '@oml/engine';
import { describe, expect, it } from 'vitest';
import { eventText } from '../src/eventText';
import { makeT } from '../src/i18n';
import { applyChoice, collectChoices } from '../src/postBattle';
import { buildConfig, startBattle } from '../src/setup';
import { applyEvent, viewFromState } from '../src/view';

const choice = {
  player: 'species:gnistkat',
  playerLevel: 12,
  opponent: 'trainer:leader_water',
  opponentLevel: 5,
  seed: 3,
};

describe('i18n', () => {
  it('fills params and falls back to the key', () => {
    const t = makeT('da');
    expect(t('ui.wild', { name: 'X' })).toBe('Vild X');
    expect(t('no.such.key')).toBe('no.such.key');
    expect(makeT('en')('ui.run')).toBe(i18n.en['ui.run']);
  });
});

describe('setup', () => {
  it('builds trainer and wild battles with a human player side', () => {
    const trainer = buildConfig(choice);
    expect(trainer.kind).toBe('leader');
    expect(trainer.sides[0].ai).toBe(null);
    expect(trainer.sides[1].team).toHaveLength(3);
    const wild = buildConfig({ ...choice, opponent: 'wild:torvdue' });
    expect(wild.kind).toBe('wild');
    expect(
      buildConfig({ ...choice, player: 'trainer:trainer_student' }).sides[0].team,
    ).toHaveLength(3);
    expect(() => buildConfig({ ...choice, opponent: 'trainer:nobody' })).toThrow();
  });
});

describe('event playback', () => {
  it('replaying events onto the pre-turn view matches the engine state, with text for every line', () => {
    const t = makeT('en');
    let state = startBattle(choice);
    for (let i = 0; i < 40 && state.result === 'ongoing'; i++) {
      const result = resolveTurn(state, [
        chooseAiAction(state, 0, 'trainer'),
        chooseAiAction(state, 1, 'leader'),
      ]);
      let view = viewFromState(state);
      for (const e of result.events) {
        view = applyEvent(view, e, state);
        const text = eventText(e, state, t);
        if (text !== null) expect(text).not.toMatch(/^(event|ui|move|species)\./);
      }
      const expected = viewFromState(result.state);
      for (const side of [0, 1] as const) {
        expect(view[side].uid).toBe(expected[side].uid);
        expect(view[side].hp).toBe(expected[side].hp);
        expect(view[side].level).toBe(expected[side].level);
      }
      state = result.state;
    }
  });

  it('has text for every event type in both locales', () => {
    const state = startBattle(choice);
    const uid = state.sides[0].team[0]!.uid;
    const w = { side: 0 as const, uid };
    const events: BattleEvent[] = [
      { type: 'move_used', ...w, moveId: 'kiln_blast' },
      { type: 'cant_act', ...w, reason: 'sleep' },
      { type: 'miss', ...w },
      { type: 'damage', ...w, amount: 3, hp: 1, maxHp: 4, source: 'recoil' },
      { type: 'effectiveness', ...w, multiplier: 0 },
      { type: 'effectiveness', ...w, multiplier: 2 },
      { type: 'crit', ...w },
      { type: 'status_applied', ...w, status: 'burn' },
      { type: 'status_cured', ...w, status: 'burn' },
      { type: 'status_damage', ...w, status: 'poison', amount: 1, hp: 1, maxHp: 4 },
      { type: 'stat_change', ...w, stat: 'atk', stages: -1, stage: -1 },
      { type: 'stat_change', ...w, stat: 'atk', stages: 0, stage: 6 },
      { type: 'no_effect', ...w },
      { type: 'heal', ...w, amount: 1, hp: 2, maxHp: 4 },
      { type: 'faint', ...w },
      { type: 'item_used', ...w, itemId: 'small_tonic' },
      { type: 'catch_attempt', ...w, itemId: 'basic_charm', chance: 0.5, success: false },
      { type: 'caught', ...w },
      { type: 'ran', side: 0 },
      { type: 'run_failed', side: 0, attempts: 1 },
      { type: 'sent_to_storage', ...w },
      { type: 'xp_gain', ...w, amount: 5, xp: 10 },
      { type: 'level_up', ...w, level: 13, hp: 4, maxHp: 4 },
      { type: 'move_learned', ...w, moveId: 'stoke_up' },
      { type: 'move_learn_choice', ...w, moveId: 'stoke_up' },
      { type: 'evolution_ready', ...w, speciesId: 'gnistkat', into: 'baalkat' },
      { type: 'needs_replacement', side: 0 },
      { type: 'battle_end', result: 'caught' },
    ];
    for (const locale of ['en', 'da'] as const) {
      const t = makeT(locale);
      for (const e of events) {
        const text = eventText(e, state, t);
        expect(text, e.type).toBeTruthy();
        expect(text).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe('post-battle choices', () => {
  it('collects side-0 learn and evolve prompts without duplicates', () => {
    const events: BattleEvent[] = [
      { type: 'move_learn_choice', side: 0, uid: 'p0', moveId: 'kiln_blast' },
      { type: 'evolution_ready', side: 0, uid: 'p0', speciesId: 'gnistkat', into: 'baalkat' },
      { type: 'evolution_ready', side: 0, uid: 'p0', speciesId: 'gnistkat', into: 'baalkat' },
      { type: 'move_learn_choice', side: 1, uid: 'o0', moveId: 'kiln_blast' },
      { type: 'turn_start', turn: 3 },
    ];
    const choices = collectChoices(events);
    expect(choices).toEqual([
      { kind: 'learn', uid: 'p0', moveId: 'kiln_blast' },
      { kind: 'evolve', uid: 'p0', into: 'baalkat' },
    ]);
    expect(collectChoices(events, choices)).toEqual(choices);
  });

  it('applies forget/skip and evolve/decline outside battle', () => {
    const team = [createCreature('gnistkat', 16, 'p0'), createCreature('torvdue', 5, 'p1')];
    const learned = applyChoice(team, { kind: 'learn', uid: 'p0', moveId: 'kiln_blast' }, 1);
    expect(learned[0]!.moves[1]!.moveId).toBe('kiln_blast');
    expect(learned[1]).toBe(team[1]);
    expect(applyChoice(team, { kind: 'learn', uid: 'p0', moveId: 'kiln_blast' }, null)).toEqual(
      team,
    );
    const evolved = applyChoice(team, { kind: 'evolve', uid: 'p0', into: 'baalkat' }, true);
    expect(evolved[0]!.speciesId).toBe('baalkat');
    expect(
      applyChoice(team, { kind: 'evolve', uid: 'p0', into: 'baalkat' }, false)[0]!.speciesId,
    ).toBe('gnistkat');
  });
});
