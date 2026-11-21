import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import { loadSave, newSave, pruneSave, type SaveGame } from '@oml/game';

/**
 * The save lives in its own IndexedDB database. Key "save" holds the current SaveGame;
 * a save that fails to load is kept under "backup-<time>" before the player starts over.
 * Legacy M2a data (localStorage) is migrated once, as save version 0.
 */
const SAVE_KEY = 'save';
const LEGACY_USED = 'oml.map.usedSpawns.v1';
const LEGACY_BATTLE = 'oml.map.battle.v1';

let store: UseStore | null = null;
const db = () => (store ??= createStore('oml-save', 'kv'));

export function randomSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export type Loaded =
  { kind: 'ok'; save: SaveGame } | { kind: 'corrupt'; error: string; backupKey: string };

function readLegacy(): Record<string, unknown> | null {
  try {
    const used = localStorage.getItem(LEGACY_USED);
    const battle = localStorage.getItem(LEGACY_BATTLE);
    if (!used && !battle) return null;
    return { version: 0, usedSpawns: used ? JSON.parse(used) : {}, battle: battle ? 1 : null };
  } catch {
    return { version: 0 };
  }
}

function clearLegacy() {
  try {
    localStorage.removeItem(LEGACY_USED);
    localStorage.removeItem(LEGACY_BATTLE);
  } catch {
    // ignore
  }
}

export async function loadGame(language: SaveGame['settings']['language']): Promise<Loaded> {
  let raw: unknown;
  try {
    raw = await get(SAVE_KEY, db());
  } catch (e) {
    return { kind: 'corrupt', error: String(e), backupKey: '' };
  }
  if (raw === undefined) {
    const legacy = readLegacy();
    const result = legacy ? loadSave(legacy, randomSeed()) : null;
    const save = result?.ok ? result.save : newSave(randomSeed(), language);
    save.settings.language = language;
    await writeGame(save);
    clearLegacy();
    return { kind: 'ok', save };
  }
  const result = loadSave(raw, randomSeed());
  if (result.ok) {
    if (result.migrated) await writeGame(result.save);
    return { kind: 'ok', save: result.save };
  }
  const backupKey = `backup-${Date.now()}`;
  try {
    await set(backupKey, raw, db());
  } catch {
    // keep going: the original stays under "save" until the player starts over
  }
  return { kind: 'corrupt', error: result.error, backupKey };
}

let queue: Promise<unknown> = Promise.resolve();

/** Writes are queued so they land in order; expired used spawns are pruned first. */
export function writeGame(save: SaveGame): Promise<void> {
  const pruned = pruneSave(save, nowSeconds());
  const p = queue.then(() => set(SAVE_KEY, pruned, db()));
  queue = p.catch(() => undefined);
  return p;
}

export async function deleteGame(): Promise<void> {
  await queue;
  for (const k of await keys(db())) await del(k, db());
  clearLegacy();
}

export async function startOver(language: SaveGame['settings']['language']): Promise<SaveGame> {
  const save = newSave(randomSeed(), language);
  await writeGame(save);
  return save;
}

/** The save as a JSON file (Settings → Export save). */
export function exportGameFile(save: SaveGame): File {
  const name = `odense-monster-league-save-${new Date().toISOString().slice(0, 10)}.json`;
  return new File([JSON.stringify(pruneSave(save, nowSeconds()), null, 2)], name, {
    type: 'application/json',
  });
}

/** Shares a file (phone share sheet) or downloads it. */
export async function shareOrDownload(file: File): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return;
    } catch {
      // cancelled or failed: fall back to a download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
