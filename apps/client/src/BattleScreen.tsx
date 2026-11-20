import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { content } from '@oml/data';
import {
  chooseAiAction,
  getLegalActions,
  getMaxHp,
  getMove,
  inReplacementPhase,
  resolveTurn,
  type Action,
  type BattleEvent,
  type BattleState,
  type SideIndex,
  type TurnResult,
} from '@oml/engine';
import { creatureName, eventText } from './eventText';
import type { Translate } from './i18n';
import { clearBattle, saveBattle } from './storage';
import { applyEvent, viewFromState, type BattleView, type CreatureView } from './view';

interface Props {
  initial: BattleState;
  t: Translate;
  /** stillRunning = the battle was paused (and saved) rather than finished. */
  onExit: (stillRunning: boolean) => void;
}

type Panel = 'main' | 'switch' | 'bag' | 'target';
interface Anim {
  uid: string;
  cls: string;
  n: number;
}

const TEXT_MS = 750;
const SILENT_MS = 220;

function animFor(e: BattleEvent): { uid: string; cls: string } | null {
  switch (e.type) {
    case 'move_used':
      return { uid: e.uid, cls: e.side === 0 ? 'anim-lunge-up' : 'anim-lunge-down' };
    case 'damage':
    case 'status_damage':
      return { uid: e.uid, cls: 'anim-hit' };
    case 'heal':
    case 'level_up':
      return { uid: e.uid, cls: 'anim-glow' };
    case 'status_applied':
      return { uid: e.uid, cls: 'anim-pulse' };
    case 'stat_change':
      return { uid: e.uid, cls: e.stages >= 0 ? 'anim-rise' : 'anim-sink' };
    case 'switch':
      return { uid: e.uid, cls: 'anim-enter' };
    case 'miss':
      return { uid: e.uid, cls: 'anim-wobble' };
    default:
      return null;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BattleScreen({ initial, t, onExit }: Props) {
  const [state, setState] = useState(initial);
  const [view, setView] = useState<BattleView>(() => viewFromState(initial));
  const [log, setLog] = useState<string>('');
  const [anim, setAnim] = useState<Anim | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>('main');
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const alive = useRef(true);
  const skip = useRef(false);
  const animCounter = useRef(0);

  useEffect(() => {
    alive.current = true;
    saveBattle(initial);
    return () => {
      alive.current = false;
    };
  }, [initial]);

  const replacing = inReplacementPhase(state) && state.sides[0].needsReplacement;
  const over = state.result !== 'ongoing';
  const legal = over ? [] : getLegalActions(state, 0);
  const isLegal = (a: Action) => legal.some((l) => JSON.stringify(l) === JSON.stringify(a));
  const me = state.sides[0];
  const active = me.team[me.active]!;

  useEffect(() => {
    if (busy) return;
    if (over) return;
    if (replacing) {
      setPanel('switch');
      setLog(t('ui.chooseReplacement'));
    } else {
      setLog(t('ui.whatWillDo', { name: creatureName(active, t) }));
    }
  }, [busy, over, replacing, active, t]);

  async function play(prev: BattleState, result: TurnResult) {
    setBusy(true);
    skip.current = false;
    let v = viewFromState(prev);
    for (const event of result.events) {
      if (!alive.current) return;
      v = applyEvent(v, event, prev);
      setView(v);
      const text = eventText(event, prev, t);
      if (text) setLog(text);
      const a = animFor(event);
      if (a) setAnim({ ...a, n: ++animCounter.current });
      if (!skip.current) await wait(text ? TEXT_MS : SILENT_MS);
    }
    if (!alive.current) return;
    const final = viewFromState(result.state);
    setView([
      { ...final[0], caught: v[0].caught },
      { ...final[1], caught: v[1].caught },
    ]);
    setState(result.state);
    if (result.state.result === 'ongoing') saveBattle(result.state);
    else clearBattle();
    setPanel('main');
    setPendingItem(null);
    setBusy(false);
  }

  function submit(action: Action) {
    if (busy || over || !isLegal(action)) return;
    const tier = state.sides[1].ai ?? 'wild';
    const result = resolveTurn(state, [action, chooseAiAction(state, 1, tier)]);
    void play(state, result);
  }

  const movesPanel = () => {
    const outOfPp = active.moves.every((m) => m.pp <= 0);
    if (outOfPp) {
      return (
        <div className="move-grid">
          <MoveButton
            moveId="desperate_swing"
            pp={null}
            disabled={busy}
            t={t}
            onClick={() => submit({ type: 'move', index: 0 })}
          />
        </div>
      );
    }
    return (
      <div className="move-grid">
        {[0, 1, 2, 3].map((i) => {
          const slot = active.moves[i];
          if (!slot) return <div key={i} className="move-btn empty" aria-hidden />;
          return (
            <MoveButton
              key={i}
              moveId={slot.moveId}
              pp={{ pp: slot.pp, max: getMove(slot.moveId).pp }}
              disabled={busy || !isLegal({ type: 'move', index: i })}
              t={t}
              onClick={() => submit({ type: 'move', index: i })}
            />
          );
        })}
      </div>
    );
  };

  const teamPanel = (
    onPick: (index: number) => void,
    enabled: (index: number) => boolean,
    title?: string,
  ) => (
    <div className="list-panel">
      {title && <p className="panel-title">{title}</p>}
      {me.team.map((c, i) => (
        <button
          key={c.uid}
          className="btn list-btn"
          disabled={busy || !enabled(i)}
          onClick={() => onPick(i)}
        >
          <span>
            {creatureName(c, t)} · {t('ui.level')} {c.level}
            {c.status && <span className="badge">{t(`status.short.${c.status}`)}</span>}
          </span>
          <span className="muted">
            {c.hp}/{getMaxHp(c)}
          </span>
        </button>
      ))}
      {!replacing && (
        <button className="btn" onClick={() => setPanel('main')}>
          {t('ui.back')}
        </button>
      )}
    </div>
  );

  const bagPanel = () => {
    const items = Object.entries(me.items).filter(([, n]) => n > 0);
    const usable = (itemId: string) =>
      legal.some((a) => (a.type === 'item' || a.type === 'catch') && a.itemId === itemId);
    return (
      <div className="list-panel">
        {items.length === 0 && <p className="panel-title">{t('ui.emptyBag')}</p>}
        {items.map(([itemId, count]) => (
          <button
            key={itemId}
            className="btn list-btn"
            disabled={busy || !usable(itemId)}
            onClick={() => {
              if (content.items[itemId]?.kind === 'charm') submit({ type: 'catch', itemId });
              else {
                setPendingItem(itemId);
                setPanel('target');
              }
            }}
          >
            <span>
              {t(`item.${itemId}.name`)} <span className="muted">×{count}</span>
            </span>
            <span className="muted small">{t(`item.${itemId}.desc`)}</span>
          </button>
        ))}
        <button className="btn" onClick={() => setPanel('main')}>
          {t('ui.back')}
        </button>
      </div>
    );
  };

  let controls: ReactNode;
  if (over && !busy) {
    controls = (
      <div className="list-panel">
        <p className="result">{t(`ui.result.${state.result}`)}</p>
        <button className="btn primary" onClick={() => onExit(false)}>
          {t('ui.newBattle')}
        </button>
      </div>
    );
  } else if (panel === 'switch' || replacing) {
    controls = teamPanel(
      (index) => submit({ type: 'switch', index }),
      (index) => isLegal({ type: 'switch', index }),
      replacing ? t('ui.chooseReplacement') : undefined,
    );
  } else if (panel === 'bag') {
    controls = bagPanel();
  } else if (panel === 'target' && pendingItem) {
    controls = teamPanel(
      (target) => submit({ type: 'item', itemId: pendingItem, target }),
      (target) => isLegal({ type: 'item', itemId: pendingItem, target }),
      t('ui.chooseTarget'),
    );
  } else {
    controls = (
      <>
        {movesPanel()}
        <div className="action-row">
          <button className="btn" disabled={busy} onClick={() => setPanel('switch')}>
            {t('ui.switch')}
          </button>
          <button className="btn" disabled={busy} onClick={() => setPanel('bag')}>
            {t('ui.bag')}
          </button>
          <button
            className="btn"
            disabled={busy || !isLegal({ type: 'run' })}
            onClick={() => submit({ type: 'run' })}
          >
            {t('ui.run')}
          </button>
        </div>
      </>
    );
  }

  return (
    <main className="battle">
      <div className="topbar">
        <span className="muted small">
          {state.kind === 'wild' ? '' : t(`trainer.${state.sides[1].name ?? ''}.name`)}
        </span>
        <button className="btn small-btn" disabled={busy || over} onClick={() => onExit(true)}>
          {t('ui.pause')}
        </button>
      </div>
      <section className="arena-field">
        <Combatant side={1} view={view[1]} anim={anim} t={t} />
        <Combatant side={0} view={view[0]} anim={anim} t={t} />
      </section>
      <p className="log" aria-live="polite" onClick={() => (skip.current = true)}>
        {log}
      </p>
      <section className="controls">{controls}</section>
    </main>
  );
}

function MoveButton({
  moveId,
  pp,
  disabled,
  t,
  onClick,
}: {
  moveId: string;
  pp: { pp: number; max: number } | null;
  disabled: boolean;
  t: Translate;
  onClick: () => void;
}) {
  const move = getMove(moveId);
  return (
    <button
      className="move-btn"
      style={{ '--type-color': content.typeColors[move.type] } as CSSProperties}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="move-name">{t(`move.${moveId}.name`)}</span>
      <span className="move-meta">
        <span className="type-chip">{t(`type.${move.type}.name`)}</span>
        {pp && <span>{t('ui.pp', { pp: pp.pp, max: pp.max })}</span>}
      </span>
    </button>
  );
}

function Combatant({
  side,
  view,
  anim,
  t,
}: {
  side: SideIndex;
  view: CreatureView;
  anim: Anim | null;
  t: Translate;
}) {
  const species = content.species[view.speciesId]!;
  const colors = species.types.map((ty) => content.typeColors[ty]);
  const background =
    colors.length > 1 ? `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)` : colors[0];
  const hpPct = Math.max(0, Math.min(100, (100 * view.hp) / view.maxHp));
  const hpClass = hpPct > 50 ? 'ok' : hpPct > 20 ? 'warn' : 'low';
  const shape = ['round', 'blob', 'square'][view.speciesId.length % 3];
  const animCls = anim && anim.uid === view.uid ? anim.cls : '';
  return (
    <div className={`combatant side-${side}`}>
      <div className="plate">
        <div className="plate-head">
          <strong>{creatureName(view, t)}</strong>
          <span>
            {view.status && <span className="badge">{t(`status.short.${view.status}`)}</span>}
            <span className="muted">
              {' '}
              {t('ui.level')} {view.level}
            </span>
          </span>
        </div>
        <div
          className="hpbar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={view.maxHp}
          aria-valuenow={view.hp}
        >
          <div className={`hpfill ${hpClass}`} style={{ width: `${hpPct}%` }} />
        </div>
        {side === 0 && (
          <div className="hpnum">
            {view.hp}/{view.maxHp}
          </div>
        )}
      </div>
      <div
        key={`${view.uid}-${anim && anim.uid === view.uid ? anim.n : 0}`}
        className={`sprite ${shape} ${animCls} ${view.fainted ? 'fainted' : ''} ${view.caught ? 'caught' : ''}`}
        style={{ background }}
        aria-label={t(`species.${view.speciesId}.name`)}
      >
        <span>{species.types.map((ty) => t(`type.${ty}.icon`)).join('/')}</span>
      </div>
    </div>
  );
}
