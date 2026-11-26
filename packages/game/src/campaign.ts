import { regions, type Dex, type RegionId } from '@oml/data';
import { emptyJournal } from './journal';
import { CAMPAIGN_KEYS, type Campaign, type OnboardingStep, type SaveGame } from './save';

/**
 * Campaigns per region (P27, GDD "Regions"). Every region is its own campaign: its own
 * starter, team, storage, bag, badges, zones, field guide and Journal. The save's progress
 * fields are the campaign of the region being played; the others are parked and swapped in
 * when the player enters their region. Odense creatures stay in Odense.
 */

/** The content of the region being played. */
export function campaignDex(save: Pick<SaveGame, 'region'>): Dex {
  return regions[save.region];
}

/** The campaign fields of the region being played. */
export function activeCampaign(save: SaveGame): Campaign {
  return Object.fromEntries(CAMPAIGN_KEYS.map((k) => [k, save[k]])) as Campaign;
}

/**
 * A new campaign. The safety note and the location permission belong to the app, so a
 * player who has passed them starts a new region at its starter choice.
 */
export function newCampaign(onboarding: OnboardingStep): Campaign {
  return {
    onboarding: onboarding === 'safety' || onboarding === 'location' ? onboarding : 'starter',
    starter: null,
    team: [],
    storage: [],
    bag: {},
    badges: [],
    zones: [],
    coins: 0,
    defeatedTrainers: [],
    seen: {},
    caught: {},
    glimmerSeen: [],
    lastRestock: {},
    usedSpawns: {},
    devAbilities: [],
    battle: null,
    pending: [],
    journal: emptyJournal(),
    faintedSince: {},
  };
}

/**
 * The save as if `region` were played, to look at (the Town Map, badges and field guide of
 * another region): its parked campaign, or a new one before the first visit. Never saved.
 */
export function campaignView(save: SaveGame, region: RegionId): SaveGame {
  if (region === save.region) return save;
  return { ...save, ...(save.campaigns[region] ?? newCampaign(save.onboarding)), region };
}

/** A region change waits until the battle and its choices (learn a move, evolve) are done. */
export function canSwitchCampaign(save: SaveGame): boolean {
  return save.battle === null && save.pending.length === 0;
}

/**
 * Plays `region`'s campaign from now on: parks the current one and brings back `region`'s,
 * or starts a new one there. Same object when the region is already being played or a
 * battle is still on (`canSwitchCampaign`).
 */
export function switchCampaign(save: SaveGame, region: RegionId): SaveGame {
  if (save.region === region || !canSwitchCampaign(save)) return save;
  const { [region]: target, ...others } = save.campaigns;
  return {
    ...save,
    ...(target ?? newCampaign(save.onboarding)),
    region,
    campaigns: { ...others, [save.region]: activeCampaign(save) },
  };
}

export interface CampaignSummary {
  region: RegionId;
  /** A starter was chosen there. */
  started: boolean;
  badges: number;
  playing: boolean;
}

/** One line per region the player has a campaign in (Settings, the Fyn map). */
export function campaignSummaries(save: SaveGame): CampaignSummary[] {
  const all: [RegionId, Campaign][] = [
    [save.region, activeCampaign(save)],
    ...(Object.entries(save.campaigns) as [RegionId, Campaign][]),
  ];
  return all.map(([region, c]) => ({
    region,
    started: c.starter !== null,
    badges: c.badges.length,
    playing: region === save.region,
  }));
}
