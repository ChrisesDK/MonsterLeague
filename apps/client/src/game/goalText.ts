import { content } from '@oml/data';
import type { Goal } from '@oml/game';
import type { Translate } from '../i18n';

/** One line of text for a Journal goal. */
export function goalTitle(g: Goal, t: Translate): string {
  const district = t(`district.${g.district}.name`);
  switch (g.kind) {
    case 'reach':
      return t('goal.reach', { district });
    case 'route':
      return t('goal.route', { route: t(`route.${g.routeId}.name`) });
    case 'trainers':
      return t('goal.trainers', { district, n: g.progress!.n, of: g.progress!.of });
    case 'rest':
      return t('goal.rest', { district });
    case 'arena':
      return t(g.comingSoon ? 'goal.arenaSoon' : 'goal.arena', {
        place: t(`arenaSite.${g.arena}.name`),
      });
    case 'exploreWild':
      return t('goal.exploreWild', { district });
    case 'catchType':
      return t('goal.catchType', { district, type: t(`type.${g.type}.name`) });
    case 'findRare':
      return t('goal.findRare', { district });
  }
}

/** Progress as text and a 0–1 share (null when the goal has no counter). */
export function goalProgress(g: Goal, t: Translate): { text: string; share: number } | null {
  if (!g.progress) return null;
  const { n, of } = g.progress;
  if (g.kind === 'route') {
    const route = content.routes[g.routeId!]!;
    // the goal completes at 80 % of the checkpoints; show progress towards that
    const pct = Math.min(100, Math.round((100 * n) / Math.max(1, Math.ceil(of * 0.8))));
    return { text: t('goal.routeProgress', { pct, m: route.lengthM }), share: pct / 100 };
  }
  if (g.kind === 'exploreWild') return { text: t('goal.metres', { n, of }), share: n / of };
  return { text: `${n}/${of}`, share: n / of };
}

export function formatM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
