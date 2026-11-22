import { describe, expect, it, vi } from 'vitest';
import { handleBack, pushBackHandler } from '../src/ui/backStack';
import { previousScreen } from '../src/game/Screens';
import { chooseStarter, newSave } from '@oml/game';

describe('back stack: menus go back a level, the game view asks to leave', () => {
  it('nothing open: not handled (the guard asks to leave)', () => {
    expect(handleBack()).toBe(false);
  });
  it('the newest open screen handles it; removed handlers no longer do', () => {
    const menu = vi.fn();
    const town = vi.fn();
    const offMenu = pushBackHandler(menu);
    const offTown = pushBackHandler(town);
    expect(handleBack()).toBe(true);
    expect(town).toHaveBeenCalledTimes(1);
    expect(menu).not.toHaveBeenCalled();
    offTown();
    expect(handleBack()).toBe(true);
    expect(menu).toHaveBeenCalledTimes(1);
    offMenu();
    expect(handleBack()).toBe(false);
  });
});

describe('previousScreen: the level a back gesture goes to', () => {
  const save = chooseStarter(newSave('seed'), 'gnistkat');
  it('team → menu → game view; the Journal → game view', () => {
    expect(previousScreen('team', save)).toBe('menu');
    expect(previousScreen('bag', save)).toBe('menu');
    expect(previousScreen('settings', save)).toBe('menu');
    expect(previousScreen('menu', save)).toBeNull();
    expect(previousScreen('journal', save)).toBeNull();
  });
  it('a creature goes back to the team, or to storage if it is stored', () => {
    const uid = save.team[0]!.uid;
    expect(previousScreen(`creature:${uid}`, save)).toBe('team');
    const stored = { ...save, team: [], storage: save.team };
    expect(previousScreen(`creature:${uid}`, stored)).toBe('storage');
  });
});
