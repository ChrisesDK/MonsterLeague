import { createContext, useContext, useState, type ReactNode } from 'react';
import { badgeUrl, spriteUrl } from '@oml/art';
import { content, PLAYABLE_MUNICIPALITIES, regions, type Dex, type RegionId } from '@oml/data';
import { getMaxHp, getStats, xpForLevel, type CreatureInstance } from '@oml/engine';
import {
  canTeach,
  canUseItem,
  buyItem,
  marketStock,
  sellItem,
  sellPrice,
  fieldAbilitiesUnlocked,
  forgetFieldAbility,
  guideHints,
  moveToStorage,
  moveToTeam,
  obedienceLevel,
  setLead,
  swapWithStorage,
  teachFieldAbility,
  addToBag,
  applyItem,
  campaignView,
  isDistrictOpen,
  isZoneOpen,
  journal,
  RECOVERY_SECONDS,
  type Goal,
  type SaveGame,
} from '@oml/game';
import { creatureName } from '../eventText';
import { Button, ListRow, ProgressBar, Pill, Tabs } from '../ui/components';
import { Icon, type IconName } from '../ui/icons';
import { useBackHandler } from '../ui/backStack';
import { goalProgress, goalTitle } from './goalText';
import { makeT, type Translate } from '../i18n';
import { deleteGame, exportGameFile, readGameFile, shareOrDownload, writeGame } from './store';
import { APP_VERSION } from '../version';
import { WelcomeScreen } from './Onboarding';

export type ScreenId =
  | 'menu'
  | 'journal'
  | 'team'
  | 'storage'
  | 'bag'
  | 'guide'
  | 'badges'
  | 'settings'
  /** D175: send feedback (a menu tile; nothing pops up by itself). */
  | 'feedback'
  | `creature:${string}`
  /** A market (D165): opened from its card on the map; back returns to the game view. */
  | `market:${string}`;

/**
 * The screen one level up, as the screens' own back buttons go (null: back to the game
 * view). Used for the back gesture (owner: in a menu it goes back a level).
 */
export function previousScreen(screen: ScreenId, save: SaveGame): ScreenId | null {
  if (screen === 'menu' || screen === 'journal' || screen.startsWith('market:')) return null;
  if (screen.startsWith('creature:')) {
    const uid = screen.slice('creature:'.length);
    return save.storage.some((c) => c.uid === uid) ? 'storage' : 'team';
  }
  return 'menu';
}

interface Props {
  t: Translate;
  screen: ScreenId;
  onScreen: (s: ScreenId | null) => void;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
  devTools: boolean;
  gate3: ReactNode;
  onClose: () => void;
}

function Shell({
  t,
  title,
  onBack,
  children,
  testId,
}: {
  t: Translate;
  title: string;
  onBack: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <main className="setup screen" data-testid={testId}>
      <div className="screen-top">
        <Button
          round
          icon="back"
          data-testid="screen-back"
          aria-label={t('ui.back')}
          onClick={onBack}
        />
        <h1>{title}</h1>
      </div>
      {children}
    </main>
  );
}

/** Fainted creatures' recovery clock (save.faintedSince), for the HP lines. */
const FaintedSince = createContext<Record<string, number>>({});

/** "4 h 10 min" until a fainted creature recovers by itself. */
export function recoveryText(since: number | undefined, nowSeconds: number, t: Translate): string {
  if (since === undefined) return t('team.fainted');
  const left = Math.max(0, since + RECOVERY_SECONDS - nowSeconds);
  const h = Math.floor(left / 3600);
  const m = Math.max(1, Math.ceil((left % 3600) / 60));
  return t('team.recovers', { time: h > 0 ? `${h} h ${m} min` : `${m} min` });
}

function HpLine({ c, t }: { c: CreatureInstance; t: Translate }) {
  const dex = useContext(RegionDex);
  const fainted = useContext(FaintedSince);
  const max = getMaxHp(c, dex);
  const pct = Math.max(0, Math.min(100, (100 * c.hp) / max));
  return (
    <span className="hp-line">
      <span className="hpbar small-bar">
        <span
          className={`hpfill ${pct > 50 ? 'ok' : pct > 20 ? 'warn' : 'low'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="muted small">
        {c.hp <= 0
          ? recoveryText(fainted[c.uid], Math.floor(Date.now() / 1000), t)
          : `${c.hp}/${max}`}
        {c.status && c.hp > 0 ? ` · ${t(`status.short.${c.status}`)}` : ''}
      </span>
    </span>
  );
}

function CreatureRow({
  c,
  t,
  onClick,
  testId,
}: {
  c: CreatureInstance;
  t: Translate;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button className="btn list-btn creature-row" data-testid={testId} onClick={onClick}>
      <img src={spriteUrl(c.speciesId)} alt="" className={c.shiny ? 'shiny' : ''} />
      <span className="creature-row-main">
        <strong>
          {creatureName(c, t)}
          {c.shiny && <span className="shiny-mark inline"> ✦</span>}
        </strong>
        <span className="muted small">
          {t('ui.level')} {c.level}
          {c.fieldAbility ? ` · ${t(`fieldAbility.${c.fieldAbility}.name`)}` : ''}
        </span>
        <HpLine c={c} t={t} />
      </span>
    </button>
  );
}

/** P27: the content of the campaign being played (its creatures, places, badges). */
const RegionDex = createContext<Dex>(content);

export function Screens(props: Props) {
  return (
    <RegionDex.Provider value={regions[props.save.region]}>
      <FaintedSince.Provider value={props.save.faintedSince}>
        <ScreensInner {...props} />
      </FaintedSince.Provider>
    </RegionDex.Provider>
  );
}

function ScreensInner({ t, screen, onScreen, save, update, devTools, gate3, onClose }: Props) {
  const back = () => onScreen('menu');

  if (screen === 'menu') {
    const items: { id: ScreenId; label: string; icon: IconName }[] = [
      { id: 'journal', label: t('menu.journal'), icon: 'journal' },
      { id: 'team', label: t('menu.team'), icon: 'team' },
      { id: 'bag', label: t('menu.bag'), icon: 'bag' },
      { id: 'guide', label: t('menu.guide'), icon: 'guide' },
      { id: 'badges', label: t('menu.badges'), icon: 'badge' },
      { id: 'storage', label: t('menu.storage'), icon: 'paw' },
      { id: 'settings', label: t('menu.settings'), icon: 'settings' },
      { id: 'feedback', label: t('menu.feedback'), icon: 'feedback' },
    ];
    return (
      <Shell t={t} title={t('menu.title')} onBack={onClose} testId="screen-menu">
        <nav className="menu-list">
          {items.map((i) => (
            <Button
              key={i.id}
              className="menu-tile"
              icon={i.icon}
              data-testid={`menu-${i.id}`}
              onClick={() => onScreen(i.id)}
            >
              {i.label}
            </Button>
          ))}
          <Button
            variant="primary"
            icon="map"
            className="menu-back"
            data-testid="menu-map"
            onClick={onClose}
          >
            {t('menu.map')}
          </Button>
        </nav>
      </Shell>
    );
  }

  if (screen === 'journal') return <JournalScreen t={t} save={save} onBack={onClose} />;

  if (screen === 'team') {
    return (
      <Shell t={t} title={t('menu.team')} onBack={back} testId="screen-team">
        <p className="muted small">{t('team.obedience', { level: obedienceLevel(save.badges) })}</p>
        <div className="list-panel">
          {save.team.map((c, i) => (
            <CreatureRow
              key={c.uid}
              c={c}
              t={t}
              testId={`team-${i}`}
              onClick={() => onScreen(`creature:${c.uid}`)}
            />
          ))}
        </div>
      </Shell>
    );
  }

  if (screen.startsWith('market:')) {
    const poiId = screen.slice('market:'.length);
    return <MarketScreen t={t} poiId={poiId} save={save} update={update} onBack={onClose} />;
  }

  if (screen.startsWith('creature:')) {
    const uid = screen.slice('creature:'.length);
    return (
      <CreatureDetail
        t={t}
        uid={uid}
        save={save}
        update={update}
        onBack={() => onScreen(save.storage.some((c) => c.uid === uid) ? 'storage' : 'team')}
      />
    );
  }

  if (screen === 'storage')
    return <StorageScreen t={t} save={save} update={update} onBack={back} onScreen={onScreen} />;
  if (screen === 'bag') return <BagScreen t={t} save={save} update={update} onBack={back} />;
  if (screen === 'guide') return <GuideScreen t={t} save={save} onBack={back} />;
  if (screen === 'feedback') return <FeedbackScreen t={t} save={save} onBack={back} />;
  if (screen === 'badges') return <BadgesScreen t={t} save={save} onBack={back} />;
  return (
    <SettingsScreen
      t={t}
      save={save}
      update={update}
      onBack={back}
      devTools={devTools}
      gate3={gate3}
    />
  );
}

function CreatureDetail({
  t,
  uid,
  save,
  update,
  onBack,
}: {
  t: Translate;
  uid: string;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
  onBack: () => void;
}) {
  const dex = useContext(RegionDex);
  const [forgetFor, setForgetFor] = useState<string | null>(null);
  const c = [...save.team, ...save.storage].find((x) => x.uid === uid);
  if (!c) return null;
  const species = dex.species[c.speciesId]!;
  const stats = getStats(c, dex);
  const inTeam = save.team.some((x) => x.uid === uid);
  const next = xpForLevel(c.level + 1);
  const abilities = fieldAbilitiesUnlocked(save).filter(
    (id) => canTeach(save, c, id) !== 'wrongType',
  );
  return (
    <Shell
      t={t}
      title={c.shiny ? `${creatureName(c, t)} ✦` : creatureName(c, t)}
      onBack={onBack}
      testId="screen-creature"
    >
      <div className="detail-head">
        <img src={spriteUrl(c.speciesId)} alt="" className={c.shiny ? 'shiny' : ''} />
        <div>
          {c.shiny && (
            <p className="shiny-label" data-testid="detail-shiny">
              ✦ {t('ui.shiny')}
            </p>
          )}
          <p>
            {species.types.map((ty) => t(`type.${ty}.name`)).join(' / ')} · {t('ui.level')}{' '}
            {c.level}
          </p>
          <HpLine c={c} t={t} />
          <p className="muted small">
            {t('detail.xp', { xp: c.xp, next: c.level >= 50 ? '—' : next })}
          </p>
        </div>
      </div>
      <dl className="stat-grid">
        {(['hp', 'atk', 'def', 'spd'] as const).map((k) => (
          <div key={k}>
            <dt>{t(`stat.${k}`)}</dt>
            <dd>{stats[k]}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small" data-testid="detail-ivs">
        {c.ivs
          ? t('detail.ivs', { hp: c.ivs.hp, atk: c.ivs.atk, def: c.ivs.def })
          : t('detail.ivsAverage')}
      </p>
      <h2>{t('detail.moves')}</h2>
      <ul className="move-list">
        {c.moves.map((m) => (
          <li key={m.moveId}>
            {t(`move.${m.moveId}.name`)}{' '}
            <span className="muted small">
              {t(`type.${dex.moves[m.moveId]!.type}.name`)} ·{' '}
              {t('ui.pp', { pp: m.pp, max: dex.moves[m.moveId]!.pp })}
            </span>
          </li>
        ))}
        {c.fieldAbility && (
          <li data-testid="detail-ability">
            {t(`fieldAbility.${c.fieldAbility}.name`)}{' '}
            <span className="muted small">{t('detail.fieldAbility')}</span>{' '}
            <button
              className="btn small-btn"
              onClick={() => update((s) => forgetFieldAbility(s, uid))}
            >
              {t('detail.forgetAbility')}
            </button>
          </li>
        )}
      </ul>
      {!c.fieldAbility && abilities.length > 0 && (
        <section className="panel-section">
          <h2>{t('detail.teach')}</h2>
          <p className="muted small">{t('detail.teachHelp')}</p>
          {abilities.map((id) => {
            const check = canTeach(save, c, id);
            if (forgetFor === id) {
              return (
                <div key={id} className="list-panel">
                  <p>{t('detail.forgetFor', { ability: t(`fieldAbility.${id}.name`) })}</p>
                  {c.moves.map((m, i) => (
                    <button
                      key={m.moveId}
                      className="btn list-btn"
                      onClick={() => {
                        update((s) => teachFieldAbility(s, uid, id, i));
                        setForgetFor(null);
                      }}
                    >
                      {t('ui.learn.forget', { move: t(`move.${m.moveId}.name`) })}
                    </button>
                  ))}
                  <button className="btn" onClick={() => setForgetFor(null)}>
                    {t('ui.back')}
                  </button>
                </div>
              );
            }
            return (
              <button
                key={id}
                className="btn list-btn"
                data-testid={`teach-${id}`}
                onClick={() =>
                  check === 'needsForget'
                    ? setForgetFor(id)
                    : update((s) => teachFieldAbility(s, uid, id, null))
                }
              >
                {t(`fieldAbility.${id}.name`)}
              </button>
            );
          })}
        </section>
      )}
      <div className="row-wrap">
        {inTeam && save.team[0]?.uid !== uid && (
          <button className="btn" onClick={() => update((s) => setLead(s, uid))}>
            {t('detail.lead')}
          </button>
        )}
        {inTeam && save.team.length > 1 && (
          <button
            className="btn"
            onClick={() => {
              update((s) => moveToStorage(s, uid));
              onBack();
            }}
          >
            {t('detail.toStorage')}
          </button>
        )}
        {!inTeam && save.team.length < 6 && (
          <button className="btn" onClick={() => update((s) => moveToTeam(s, uid))}>
            {t('detail.toTeam')}
          </button>
        )}
      </div>
    </Shell>
  );
}

function StorageScreen({
  t,
  save,
  update,
  onBack,
  onScreen,
}: {
  t: Translate;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
  onBack: () => void;
  onScreen: (s: ScreenId) => void;
}) {
  const [swap, setSwap] = useState<string | null>(null);
  return (
    <Shell t={t} title={t('menu.storage')} onBack={onBack} testId="screen-storage">
      {save.storage.length === 0 && <p className="muted">{t('storage.empty')}</p>}
      <div className="storage-grid">
        {save.storage.map((c) => (
          <div key={c.uid} className="storage-cell">
            <CreatureRow c={c} t={t} onClick={() => onScreen(`creature:${c.uid}`)} />
            {save.team.length < 6 ? (
              <button className="btn small-btn" onClick={() => update((s) => moveToTeam(s, c.uid))}>
                {t('detail.toTeam')}
              </button>
            ) : (
              <button className="btn small-btn" onClick={() => setSwap(c.uid)}>
                {t('storage.swap')}
              </button>
            )}
          </div>
        ))}
      </div>
      {swap && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>{t('storage.swapWith')}</h2>
            {save.team.map((c) => (
              <button
                key={c.uid}
                className="btn list-btn"
                onClick={() => {
                  update((s) => swapWithStorage(s, c.uid, swap));
                  setSwap(null);
                }}
              >
                {creatureName(c, t)} · {t('ui.level')} {c.level}
              </button>
            ))}
            <button className="btn" onClick={() => setSwap(null)}>
              {t('ui.back')}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function BagScreen({
  t,
  save,
  update,
  onBack,
}: {
  t: Translate;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
  onBack: () => void;
}) {
  const dex = useContext(RegionDex);
  const [using, setUsing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const items = Object.entries(save.bag).filter(([, n]) => n > 0);
  const targets = [...save.team, ...save.storage];
  return (
    <Shell t={t} title={t('menu.bag')} onBack={onBack} testId="screen-bag">
      <p className="coins-line" data-testid="bag-coins">
        <Icon name="coin" /> {t('coins.amount', { n: save.coins })}
      </p>
      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}
      {items.length === 0 && <p className="muted">{t('ui.emptyBag')}</p>}
      <div className="list-panel">
        {items.map(([id, n]) => {
          const usable = dex.items[id]?.kind !== 'charm';
          return (
            <button
              key={id}
              className="btn list-btn"
              data-testid={`bag-${id}`}
              disabled={!usable}
              onClick={() => setUsing(id)}
            >
              <span>
                {t(`item.${id}.name`)} <span className="muted">×{n}</span>
              </span>
              <span className="muted small">
                {usable ? t(`item.${id}.desc`) : t('bag.charmHint')}
              </span>
            </button>
          );
        })}
      </div>
      {using && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>{t('bag.useOn', { item: t(`item.${using}.name`) })}</h2>
            {targets.map((c) => (
              <button
                key={c.uid}
                className="btn list-btn"
                data-testid={`use-on-${c.uid}`}
                disabled={!canUseItem(c, using, dex)}
                onClick={() => {
                  update((s) => applyItem(s, using, c.uid));
                  setMsg(
                    t('bag.used', { item: t(`item.${using}.name`), name: creatureName(c, t) }),
                  );
                  setUsing(null);
                }}
              >
                <span>{creatureName(c, t)}</span>
                <HpLine c={c} t={t} />
              </button>
            ))}
            <button className="btn" onClick={() => setUsing(null)}>
              {t('ui.back')}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

/**
 * Market (D165): buy items for skilling, sell items from the bag for half their price. Items
 * behind a badge (Good Charm: badge 2, Great Charm: badge 5) say which badge they need.
 */
function MarketScreen({
  t,
  poiId,
  save,
  update,
  onBack,
}: {
  t: Translate;
  poiId: string;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
  onBack: () => void;
}) {
  const dex = useContext(RegionDex);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [msg, setMsg] = useState<string | null>(null);
  const stock = marketStock(save);
  const priced = Object.values(dex.items).filter((i) => i.price !== undefined);
  const sellable = Object.entries(save.bag).filter(([id, n]) => n > 0 && sellPrice(id) > 0);
  const buy = (id: string) => {
    const next = buyItem(save, id);
    if (!next) return setMsg(t('market.cantAfford'));
    update(() => next);
    setMsg(t('market.bought', { item: t(`item.${id}.name`) }));
  };
  const sell = (id: string) => {
    const next = sellItem(save, id);
    if (!next) return;
    update(() => next);
    setMsg(t('market.sold', { item: t(`item.${id}.name`), n: sellPrice(id) }));
  };
  return (
    <Shell t={t} title={t(`poi.${poiId}.name`)} onBack={onBack} testId="screen-market">
      <p className="coins-line" data-testid="market-coins">
        <Icon name="coin" /> {t('coins.amount', { n: save.coins })}
      </p>
      <Tabs
        tabs={[
          { id: 'buy', label: t('market.buy') },
          { id: 'sell', label: t('market.sell') },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setMsg(null);
        }}
      />
      {msg && (
        <p className="notice" role="status" data-testid="market-msg">
          {msg}
        </p>
      )}
      {tab === 'buy' ? (
        <div className="list-panel">
          {priced.map((i) => {
            const open = stock.includes(i.id);
            return (
              <button
                key={i.id}
                className="btn list-btn"
                data-testid={`buy-${i.id}`}
                disabled={!open || i.price! > save.coins}
                onClick={() => buy(i.id)}
              >
                <span>
                  {t(`item.${i.id}.name`)} <span className="muted">×{save.bag[i.id] ?? 0}</span>
                </span>
                <span className="muted small">
                  {open
                    ? `${t(`item.${i.id}.desc`)} · ${t('coins.amount', { n: i.price! })}`
                    : t('market.needsBadge', { badge: t(`badge.${i.marketBadge}.name`) })}
                </span>
              </button>
            );
          })}
        </div>
      ) : sellable.length === 0 ? (
        <p className="muted">{t('market.nothingToSell')}</p>
      ) : (
        <div className="list-panel">
          {sellable.map(([id, n]) => (
            <button
              key={id}
              className="btn list-btn"
              data-testid={`sell-${id}`}
              onClick={() => sell(id)}
            >
              <span>
                {t(`item.${id}.name`)} <span className="muted">×{n}</span>
              </span>
              <span className="muted small">{t('market.sellFor', { n: sellPrice(id) })}</span>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}

/** "1–8", "2, 5" or "1–3, 6": districts as short runs. */
export function districtRuns(ds: number[]): string {
  const sorted = [...new Set(ds)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    runs.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return runs.join(', ');
}

/**
 * Where to find a creature. The same place in several districts is one line ("Districts
 * 1–8: …", owner request: a creature found everywhere listed eight lines).
 */
function hintText(t: Translate, speciesId: string, dex: Dex): string[] {
  const homes: string[] = [];
  const byPlace = new Map<
    string,
    { districts: number[]; where: string; when: string; needs: string }
  >();
  const all = new Set(Object.values(dex.zones).map((z) => z.district)).size;
  for (const h of guideHints(speciesId, dex)) {
    const where = h.biomes.map((b) => t(`biome.${b}.near`)).join(t('guide.or'));
    const when = h.time === 'night' ? t('guide.atNight') : h.time === 'day' ? t('guide.byDay') : '';
    const needs = h.requires ? ` (${t(`fieldAbility.${h.requires}.name`)})` : '';
    // D173: a destination creature names its home(s), so players know where to travel
    if (h.zones.length > 0) {
      const place = h.zones.map((z) => t(`zone.${z}.name`)).join(t('guide.or'));
      homes.push(t(h.mainHome ? 'guide.homeMain' : 'guide.homeAlso', { place, when }) + needs);
      continue;
    }
    const key = `${where}|${when}|${needs}`;
    const e = byPlace.get(key) ?? { districts: [], where, when, needs };
    e.districts.push(h.district);
    byPlace.set(key, e);
  }
  const lines = [...byPlace.values()].map((e) => {
    const n = new Set(e.districts).size;
    const key = n >= all ? 'guide.hintAll' : n > 1 ? 'guide.hintMany' : 'guide.hint';
    return t(key, { district: districtRuns(e.districts), where: e.where, when: e.when }) + e.needs;
  });
  return [...homes, ...lines];
}

/**
 * D175: feedback for testers. The text and a short game summary (version, badges, team
 * levels, counts; never a position or the current zone) go out through the phone's share
 * sheet, or are copied when the phone can't share.
 */
const FEEDBACK_KINDS = ['bug', 'idea', 'balance', 'other'] as const;
export function feedbackText(
  kind: (typeof FEEDBACK_KINDS)[number],
  message: string,
  save: SaveGame,
): string {
  const team = save.team.map((c) => `${c.speciesId} ${c.level}`).join(', ');
  return [
    `[${kind}] ${message.trim()}`,
    '',
    `Version ${APP_VERSION} · ${save.region} · ${save.settings.language} · ${new Date().toISOString().slice(0, 10)}`,
    `Badges: ${save.badges.join(', ') || 'none'} · team: ${team || 'none'}`,
    `Caught ${Object.keys(save.caught).length} species · zones open ${save.zones.length} · trainers beaten ${save.defeatedTrainers.length} · coins ${save.coins}`,
  ].join('\n');
}

function FeedbackScreen({ t, save, onBack }: { t: Translate; save: SaveGame; onBack: () => void }) {
  const [kind, setKind] = useState<(typeof FEEDBACK_KINDS)[number]>('bug');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'sent' | 'copied' | null>(null);
  const send = async () => {
    const text = feedbackText(kind, message, save);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: t('feedback.subject'), text });
        setStatus('sent');
        return;
      } catch {
        // cancelled or failed: copy instead
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus(null);
    }
  };
  return (
    <Shell t={t} title={t('menu.feedback')} onBack={onBack} testId="screen-feedback">
      <p className="muted small">{t('feedback.intro')}</p>
      <div className="chip-row" role="radiogroup">
        {FEEDBACK_KINDS.map((k) => (
          <button
            key={k}
            className={`btn choice${k === kind ? ' on' : ''}`}
            aria-pressed={k === kind}
            data-testid={`feedback-kind-${k}`}
            onClick={() => setKind(k)}
          >
            {t(`feedback.kind.${k}`)}
          </button>
        ))}
      </div>
      <textarea
        className="feedback-text"
        data-testid="feedback-text"
        rows={6}
        value={message}
        placeholder={t('feedback.placeholder')}
        onChange={(e) => {
          setMessage(e.target.value);
          setStatus(null);
        }}
      />
      <p className="muted small">{t('feedback.included')}</p>
      <button
        className="btn primary wide"
        data-testid="feedback-send"
        disabled={message.trim().length === 0}
        onClick={() => void send()}
      >
        {t('feedback.send')}
      </button>
      {status && (
        <p className="notice" role="status" data-testid="feedback-status">
          {t(status === 'sent' ? 'feedback.sent' : 'feedback.copied')}
        </p>
      )}
    </Shell>
  );
}

/**
 * The field guide (owner request): one tab per playable region and a numbered list of every
 * creature of that region (#001 …), each listed once. A creature counts as seen or caught
 * when it was seen or caught anywhere in that region (in any district). Each region's tab
 * shows that region's own campaign and names, also while another region is played.
 */
function GuideScreen({ t, save, onBack }: { t: Translate; save: SaveGame; onBack: () => void }) {
  const [region, setRegion] = useState<RegionId>(save.region);
  // a pressed entry opens its page: where to find it (owner request: the list stays short)
  const [open, setOpen] = useState<string | null>(null);
  const [glimmer, setGlimmer] = useState(false);
  const openEntry = (id: string | null) => {
    setOpen(id);
    setGlimmer(false);
  };
  useBackHandler(open !== null, () => openEntry(null));
  const dex = regions[region];
  const tr = region === save.region ? t : makeT(save.settings.language, region);
  const progress =
    region === save.region
      ? { seen: save.seen, caught: save.caught, glimmerSeen: save.glimmerSeen }
      : (save.campaigns[region] ?? { seen: {}, caught: {}, glimmerSeen: [] });
  const species = Object.values(dex.species);
  const seenCount = species.filter((s) => progress.seen[s.id]?.length).length;
  const caughtCount = species.filter((s) => progress.caught[s.id]?.length).length;
  const stateOf = (id: string) =>
    progress.caught[id]?.length ? 'caught' : progress.seen[id]?.length ? 'seen' : 'unseen';
  const number = (id: string) =>
    `#${String(species.findIndex((s) => s.id === id) + 1).padStart(3, '0')}`;

  if (open) {
    const s = dex.species[open]!;
    const state = stateOf(s.id);
    const seen = state !== 'unseen';
    const glimmerSeen = progress.glimmerSeen.includes(s.id);
    const showGlimmer = glimmer && glimmerSeen;
    const at = species.findIndex((x) => x.id === s.id);
    const prev = species[at - 1];
    const next = species[at + 1];
    return (
      <Shell
        t={t}
        title={`${number(s.id)} ${seen ? tr(`species.${s.id}.name`) : '???'}`}
        onBack={() => openEntry(null)}
        testId="screen-guide-entry"
      >
        <div className="guide-entry" data-testid={`guide-entry-${s.id}`} data-state={state}>
          <div className="chip-row guide-forms" role="tablist">
            <button
              role="tab"
              data-testid="guide-form-normal"
              className={`btn choice${showGlimmer ? '' : ' on'}`}
              aria-selected={!showGlimmer}
              onClick={() => setGlimmer(false)}
            >
              {t('guide.formNormal')}
            </button>
            <button
              role="tab"
              data-testid="guide-form-glimmer"
              className={`btn choice${showGlimmer ? ' on' : ''}`}
              aria-selected={showGlimmer}
              disabled={!glimmerSeen}
              title={glimmerSeen ? undefined : t('guide.glimmerUnseen')}
              onClick={() => setGlimmer(true)}
            >
              ✦ {t('ui.shiny')}
            </button>
          </div>
          <span className="guide-entry-art">
            <img
              src={spriteUrl(s.id)}
              alt=""
              className={!seen ? 'unseen' : showGlimmer ? 'shiny' : ''}
              data-testid="guide-entry-img"
            />
            {showGlimmer && <span className="shiny-mark">✦</span>}
          </span>
          <p>
            <strong>{t(`guide.${state}`)}</strong>
            {seen && <> · {s.types.map((ty) => t(`type.${ty}.name`)).join(' / ')}</>}
          </p>
        </div>
        <h2 className="guide-where">{t('guide.where')}</h2>
        {dex.starters.includes(s.id) && <p className="muted">{t('guide.starter')}</p>}
        {hintText(tr, s.id, dex).map((h) => (
          <p key={h} className="muted">
            {h}
          </p>
        ))}
        <nav className="guide-step">
          <Button
            icon="back"
            variant="ghost"
            data-testid="guide-prev"
            disabled={!prev}
            onClick={() => prev && openEntry(prev.id)}
          >
            {prev ? number(prev.id) : t('guide.prev')}
          </Button>
          <Button
            variant="ghost"
            data-testid="guide-next"
            disabled={!next}
            onClick={() => next && openEntry(next.id)}
          >
            {next ? number(next.id) : t('guide.next')}
            <Icon name="chevron" />
          </Button>
        </nav>
      </Shell>
    );
  }

  return (
    <Shell t={t} title={t('menu.guide')} onBack={onBack} testId="screen-guide">
      <RegionTabs t={t} region={region} onRegion={setRegion} testId="guide-tab" />
      <p className="muted small" data-testid="guide-totals">
        {t('guide.totals', { seen: seenCount, caught: caughtCount, all: species.length })}
      </p>
      <div className="list-panel guide-list">
        {species.map((s, i) => {
          const state = stateOf(s.id);
          const seen = state !== 'unseen';
          return (
            <button
              type="button"
              key={s.id}
              className="guide-row-card"
              data-testid={`guide-${s.id}`}
              data-state={state}
              onClick={() => openEntry(s.id)}
            >
              <span className="guide-no">#{String(i + 1).padStart(3, '0')}</span>
              <img src={spriteUrl(s.id)} alt="" className={seen ? '' : 'unseen'} />
              <span className="guide-name">
                <strong>{seen ? tr(`species.${s.id}.name`) : '???'}</strong>
                <span className="muted small">{t(`guide.${state}`)}</span>
              </span>
              <Icon name="chevron" />
            </button>
          );
        })}
      </div>
    </Shell>
  );
}

/** One tab per playable region (field guide, badges); nothing while only one is playable. */
function RegionTabs({
  t,
  region,
  onRegion,
  testId,
}: {
  t: Translate;
  region: RegionId;
  onRegion: (r: RegionId) => void;
  testId: string;
}) {
  const tabs = PLAYABLE_MUNICIPALITIES as readonly RegionId[];
  if (tabs.length < 2) return null;
  return (
    <div className="chip-row" role="tablist">
      {tabs.map((r) => (
        <button
          key={r}
          role="tab"
          data-testid={`${testId}-${r}`}
          className={`btn choice${r === region ? ' on' : ''}`}
          aria-selected={r === region}
          onClick={() => onRegion(r)}
        >
          {t(`municipality.${r}.name`)}
        </button>
      ))}
    </div>
  );
}

/**
 * Badges and progress, one tab per region (owner request): each region's own campaign
 * (another region's is parked; nothing before the first visit). Also opened from the Town
 * Map's top bar, on the region the map shows.
 */
export function BadgesScreen({
  t,
  save,
  onBack,
  initialRegion,
}: {
  t: Translate;
  save: SaveGame;
  onBack: () => void;
  initialRegion?: RegionId;
}) {
  const [region, setRegion] = useState<RegionId>(initialRegion ?? save.region);
  const dex = regions[region];
  const view = campaignView(save, region);
  const tr = region === save.region ? t : makeT(save.settings.language, region);
  const next = [1, 2, 3, 4, 5, 6, 7, 8].find((a) => !view.badges.includes(a)) ?? null;
  const arenaPoi = Object.values(dex.pois).find((p) => p.kind === 'arena' && p.arena === next);
  return (
    <Shell t={t} title={t('menu.badges')} onBack={onBack} testId="screen-badges">
      <RegionTabs t={t} region={region} onRegion={setRegion} testId="badges-tab" />
      <div className="badge-grid" data-region={region}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((a) => {
          const earned = view.badges.includes(a);
          return (
            <figure
              key={a}
              className={`badge-slot${earned ? ' earned' : ''}`}
              data-testid={`badge-${a}`}
            >
              <img src={badgeUrl(a, earned, region)} alt="" />
              <figcaption className="small">
                {earned ? tr(`badge.${a}.name`) : t('badges.empty', { n: a })}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <p>
        {next === null
          ? t('badges.all')
          : arenaPoi
            ? t('badges.next', { name: tr(`poi.${arenaPoi.id}.name`) })
            : t('badges.nextUnknown', { n: next })}
      </p>
      <p className="muted small">
        {t('team.obedience', { level: obedienceLevel(view.badges) })} ·{' '}
        {t('badges.zones', {
          n: Object.keys(dex.zones).filter((z) => isZoneOpen(view, z)).length,
          of: Object.keys(dex.zones).length,
        })}
      </p>
      <p className="muted small" data-testid="badges-trainers">
        {t('badges.trainers', { n: view.defeatedTrainers.length })}
      </p>
    </Shell>
  );
}

function SettingsScreen({
  t,
  save,
  update,
  onBack,
  devTools,
  gate3,
}: {
  t: Translate;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
  onBack: () => void;
  devTools: boolean;
  gate3: ReactNode;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [safety, setSafety] = useState(false);
  /** D174: a save file read for import, waiting for the second tap; or why it failed. */
  const [incoming, setIncoming] = useState<SaveGame | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  if (guide) return <WelcomeScreen t={t} onContinue={() => setGuide(false)} />;
  const set = <K extends keyof SaveGame['settings']>(k: K, v: SaveGame['settings'][K]) =>
    update((s) => ({ ...s, settings: { ...s.settings, [k]: v } }));
  const s = save.settings;
  const toggle = (
    k: 'sound' | 'vibration' | 'reduceMotion' | 'buildings3d',
    label: string,
    hint?: string,
  ) => (
    <label className="toggle-row" data-testid={`setting-${k}`}>
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={s[k]}
        onChange={(e) => set(k, e.target.checked)}
      />
      {hint && <span className="muted small toggle-hint">{hint}</span>}
    </label>
  );
  /** A setting with several options: a dropdown (owner request). */
  function choice<V extends string>(
    id: string,
    label: string,
    value: V,
    options: [V, string][],
    on: (v: V) => void,
  ) {
    return (
      <label className="setting select-row" data-testid={`setting-${id}`}>
        <span>{label}</span>
        <select value={value} onChange={(e) => on(e.target.value as V)}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <Shell t={t} title={t('menu.settings')} onBack={onBack} testId="screen-settings">
      {toggle('sound', t('settings.sound'))}
      {toggle('vibration', t('settings.vibration'))}
      {choice(
        'speed',
        t('settings.speed'),
        s.speed,
        [
          ['normal', t('pt.speed.normal')],
          ['fast', t('pt.speed.fast')],
        ],
        (v) => set('speed', v),
      )}
      {choice(
        'textSize',
        t('settings.textSize'),
        s.textSize,
        [
          ['normal', t('settings.text.normal')],
          ['large', t('settings.text.large')],
          ['larger', t('settings.text.larger')],
        ],
        (v) => set('textSize', v),
      )}
      {toggle('reduceMotion', t('settings.reduceMotion'))}
      {toggle('buildings3d', t('settings.buildings3d'), t('settings.buildings3dHint'))}
      <label className="setting slider-row" data-testid="setting-fogDistance">
        <span>{t('settings.fogDistance')}</span>
        <output>{(s.fogDistance / 1000).toFixed(1)} km</output>
        <input
          type="range"
          min={800}
          max={1400}
          step={100}
          value={s.fogDistance}
          aria-valuetext={`${(s.fogDistance / 1000).toFixed(1)} km`}
          onChange={(e) => set('fogDistance', Number(e.target.value))}
        />
        <span className="muted small toggle-hint">{t('settings.fogDistanceHint')}</span>
      </label>
      {choice(
        'language',
        t('settings.language'),
        s.language,
        [
          ['da', 'Dansk'],
          ['en', 'English'],
        ],
        (v) => set('language', v),
      )}

      <section className="panel-section" data-testid="setting-safety">
        <button className="btn wide" onClick={() => setSafety((v) => !v)}>
          {t('settings.safety')}
        </button>
        {safety && (
          <ul className="safety-list">
            <li>{t('onboarding.safety.aware')}</li>
            <li>{t('onboarding.safety.stop')}</li>
            <li>{t('onboarding.safety.traffic')}</li>
            <li>{t('onboarding.safety.night')}</li>
          </ul>
        )}
      </section>

      <button className="btn wide" data-testid="open-welcome" onClick={() => setGuide(true)}>
        {t('settings.welcome')}
      </button>

      <TestItems t={t} save={save} update={update} />

      <section className="panel-section" data-testid="setting-mode">
        <h2>{t('settings.mode')}</h2>
        <p className="muted small">{t('settings.modeHint')}</p>
        <a className="btn wide link-btn" href="#/playtest" data-testid="to-playtest">
          {t('map.toPlaytest')}
        </a>
      </section>

      {gate3}

      <section className="panel-section">
        <h2>{t('settings.save')}</h2>
        <p className="muted small">{t('settings.saveHelp')}</p>
        <button
          className="btn wide"
          data-testid="export-save"
          onClick={() => void shareOrDownload(exportGameFile(save))}
        >
          {t('settings.export')}
        </button>
        <label className="btn wide file-btn" data-testid="import-save">
          {t('settings.import')}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void readGameFile(file).then((r) => {
                setIncoming(r.ok ? r.save : null);
                setImportError(r.ok ? null : r.error);
              });
            }}
          />
        </label>
        {importError && (
          <p className="notice" role="status" data-testid="import-error">
            {t('settings.importFailed', { error: importError })}
          </p>
        )}
        {incoming && (
          <button
            className="btn danger wide"
            data-testid="import-save-confirm"
            onClick={() => void writeGame(incoming).then(() => window.location.reload())}
          >
            {t('settings.importConfirm', {
              badges: incoming.badges.length,
              creatures: incoming.team.length + incoming.storage.length,
            })}
          </button>
        )}
        {!confirmDelete ? (
          <button
            className="btn danger wide"
            data-testid="delete-save"
            onClick={() => setConfirmDelete(true)}
          >
            {t('settings.delete')}
          </button>
        ) : (
          <button
            className="btn danger wide"
            data-testid="delete-save-confirm"
            onClick={() => void deleteGame().then(() => window.location.reload())}
          >
            {t('settings.deleteConfirm')}
          </button>
        )}
      </section>
      {devTools && <DevSection t={t} save={save} update={update} />}

      <p className="muted small" data-testid="settings-version">
        {t('settings.version', { version: APP_VERSION })}
      </p>
      <p className="credits muted small" data-testid="settings-credits">
        {t('settings.credits')}
      </p>
    </Shell>
  );
}

/**
 * Test items (owner request): revive items can't be found in the game yet, and early
 * testing shouldn't stall on running out of charms or tonics, so the player can add them
 * here. Remove once the game hands them out.
 */
const TEST_ITEMS = ['revive_blossom', 'basic_charm', 'small_tonic'] as const;
function TestItems({
  t,
  save,
  update,
}: {
  t: Translate;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="panel-section" data-testid="setting-test-items">
      <h2>{t('settings.testItems')}</h2>
      <p className="muted small">{t('settings.testItemsHint')}</p>
      {TEST_ITEMS.map((id) => (
        <button
          key={id}
          className="btn wide"
          data-testid={`get-${id}`}
          onClick={() => {
            update((s) => addToBag(s, id));
            const item = t(`item.${id}.name`);
            setMsg(t('settings.gotItem', { item, n: (save.bag[id] ?? 0) + 1 }));
          }}
        >
          {t('settings.getItem', { item: t(`item.${id}.name`) })}
        </button>
      ))}
      {msg && (
        <p className="small" role="status" data-testid="test-items-msg">
          {msg}
        </p>
      )}
    </section>
  );
}

function DevSection({
  t,
  save,
  update,
}: {
  t: Translate;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
}) {
  const dex = useContext(RegionDex);
  return (
    <section className="panel-section dev-section" data-testid="dev-abilities">
      <h2>{t('dev.abilities')}</h2>
      {Object.values(dex.fieldAbilities).map((f) => (
        <label key={f.id} className="toggle-row">
          <span>{t(`fieldAbility.${f.id}.name`)}</span>
          <input
            type="checkbox"
            role="switch"
            data-testid={`dev-ability-${f.id}`}
            checked={save.devAbilities.includes(f.id)}
            onChange={(e) =>
              update((s) => ({
                ...s,
                devAbilities: e.target.checked
                  ? [...s.devAbilities, f.id]
                  : s.devAbilities.filter((x) => x !== f.id),
              }))
            }
          />
        </label>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Journal (M2d, GDD "Journal")

const GOAL_ICON: Record<Goal['kind'], IconName> = {
  route: 'route',
  trainers: 'trainer',
  rest: 'rest',
  arena: 'arena',
  exploreWild: 'wild',
  catchType: 'paw',
  findRare: 'star',
};

function GoalRow({ g, t, current }: { g: Goal; t: Translate; current?: boolean }) {
  const p = goalProgress(g, t, useContext(RegionDex));
  return (
    <ListRow
      icon={GOAL_ICON[g.kind]}
      testId={`goal-${g.id}`}
      done={g.done}
      title={goalTitle(g, t)}
      subtitle={
        p && !g.done ? (
          <span className="goal-progress">
            <ProgressBar value={p.share} max={1} tone={g.main ? 'accent' : 'leaf'} label={p.text} />
            <span>{p.text}</span>
          </span>
        ) : current ? (
          <Pill tone="accent">{t('journal.now')}</Pill>
        ) : undefined
      }
    />
  );
}

function JournalScreen({ t, save, onBack }: { t: Translate; save: SaveGame; onBack: () => void }) {
  const [tab, setTab] = useState<'goals' | 'done'>('goals');
  const j = journal(save, null);
  return (
    <Shell t={t} title={t('journal.title')} onBack={onBack} testId="screen-journal">
      <section className="card accent journal-current" data-testid="journal-current">
        <span className="arrow" aria-hidden>
          <Icon name="journal" />
        </span>
        <div>
          <p className="journal-card-kicker">{t('journal.current')}</p>
          <strong data-goal={j.current?.id ?? ''}>
            {j.current ? goalTitle(j.current, t) : t('goal.allDone')}
          </strong>
        </div>
      </section>
      <p className="muted small" data-testid="journal-region">
        {t('journal.region', {
          routes: j.routesDone,
          routesTotal: j.routesTotal,
          zones: j.zonesOpen,
          zonesTotal: j.zonesTotal,
        })}
      </p>
      <Tabs
        tabs={[
          { id: 'goals', label: t('journal.goals') },
          { id: 'done', label: t('journal.completed', { n: j.completed.length }) },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'goals' ? (
        [...j.districts].reverse().map((d) => (
          <section
            key={d.district}
            className="journal-section"
            data-testid={`journal-district-${d.district}`}
          >
            <h2>
              {t(`district.${d.district}.name`)}
              {!isDistrictOpen(save, d.district) && (
                <Pill tone="warn">{t('journal.lockedZone')}</Pill>
              )}
            </h2>
            {d.main.length > 0 && <p className="panel-title small">{t('journal.main')}</p>}
            {d.main.map((g) => (
              <GoalRow key={g.id} g={g} t={t} current={g.id === j.current?.id} />
            ))}
            <p className="panel-title small">{t('journal.side')}</p>
            {d.side.map((g) => (
              <GoalRow key={g.id} g={g} t={t} />
            ))}
          </section>
        ))
      ) : j.completed.length === 0 ? (
        <p className="muted">{t('journal.noneCompleted')}</p>
      ) : (
        <div className="journal-section">
          {j.completed.map((g) => (
            <GoalRow key={g.id} g={g} t={t} />
          ))}
        </div>
      )}
    </Shell>
  );
}
