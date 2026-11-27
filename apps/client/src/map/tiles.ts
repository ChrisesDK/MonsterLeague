/**
 * The basemap's `pmtiles://` protocol (owner bug: after the installed app had been in the
 * background a while, the Town Map and sometimes the game map stayed blank until a restart).
 * pmtiles keeps the file's header and directories as promises, and a failed read (the phone
 * dropped the network in the background, an aborted request) stays cached as a rejected
 * promise, so every later map of that file failed. Here a failed read throws the caches away
 * (a fresh Protocol), and `resetTiles` does the same when the app comes back.
 */
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

let protocol = new Protocol();
let registered = false;

/** Registers the protocol once (every map that shows the basemap calls this). */
export function ensureTiles(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('pmtiles', async (params, abort) => {
    const current = protocol;
    try {
      return await current.tilev4(params, abort);
    } catch (e) {
      // a request the map itself cancelled is no fault of the file
      if (!abort.signal.aborted && current === protocol) protocol = new Protocol();
      throw e;
    }
  });
}

/** Starts the tile caches over (the next reads go to the file again). */
export function resetTiles(): void {
  protocol = new Protocol();
}
