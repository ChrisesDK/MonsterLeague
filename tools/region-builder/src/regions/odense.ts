import type { RegionConfig } from '../config';

/** Odense Kommune (region v4, GDD P22). */
export const odense: RegionConfig = {
  id: 'odense',
  osmName: 'Odense Kommune',
  /**
   * [west, south, east, north] in degrees (WGS84); cells outside the municipality border
   * (content/odense/boundary.geojson) are dropped.
   */
  bbox: [10.17, 55.28, 10.59, 55.49],
  tiles: [4, 3],
  /**
   * Routes between zones (GDD P22): numbered along the badge path first (main), then other
   * ways between the same places (alt) and routes to destinations (explore). `via` are
   * waypoints ([lng, lat]) the path must pass, e.g. a park or a river crossing.
   */
  routes: [
    { number: 1, from: 'centrum', to: 'naesbyhoved', kind: 'main', via: [] },
    { number: 2, from: 'naesbyhoved', to: 'havnen', kind: 'main', via: [] },
    { number: 3, from: 'havnen', to: 'strandskov', kind: 'main', via: [] },
    { number: 4, from: 'strandskov', to: 'stige', kind: 'main', via: [] },
    { number: 5, from: 'strandskov', to: 'hindemosen', kind: 'main', via: [] },
    { number: 6, from: 'hindemosen', to: 'hcaskoven', kind: 'main', via: [[10.4345, 55.4111]] },
    { number: 7, from: 'hcaskoven', to: 'lungsgrave', kind: 'main', via: [] },
    { number: 8, from: 'lungsgrave', to: 'botanisk', kind: 'main', via: [] },
    { number: 9, from: 'botanisk', to: 'oerbaek', kind: 'main', via: [] },
    { number: 10, from: 'oerbaek', to: 'faellesskov', kind: 'main', via: [] },
    { number: 11, from: 'faellesskov', to: 'hollufgaard', kind: 'main', via: [[10.435, 55.356]] },
    { number: 12, from: 'hollufgaard', to: 'hjallese', kind: 'main', via: [[10.43, 55.352]] },
    { number: 13, from: 'hjallese', to: 'fynskelandsby', kind: 'main', via: [[10.4056, 55.36475]] },
    { number: 14, from: 'fynskelandsby', to: 'zoo', kind: 'main', via: [[10.378, 55.3713]] },
    { number: 15, from: 'zoo', to: 'tusindaar', kind: 'main', via: [] },
    { number: 16, from: 'centrum', to: 'havnen', kind: 'alt', via: [] },
    { number: 17, from: 'havnen', to: 'sktjoergen', kind: 'alt', via: [] },
    { number: 18, from: 'sktjoergen', to: 'botanisk', kind: 'alt', via: [] },
    { number: 19, from: 'centrum', to: 'sktjoergen', kind: 'alt', via: [[10.4038, 55.3953]] },
    { number: 20, from: 'centrum', to: 'munkemose', kind: 'alt', via: [] },
    { number: 21, from: 'munkemose', to: 'zoo', kind: 'alt', via: [] },
    { number: 22, from: 'centrum', to: 'bolbro', kind: 'alt', via: [] },
    { number: 23, from: 'bolbro', to: 'tusindaar', kind: 'alt', via: [[10.3536, 55.3907]] },
    { number: 24, from: 'hindemosen', to: 'seden', kind: 'alt', via: [] },
    { number: 25, from: 'seden', to: 'hcaskoven', kind: 'alt', via: [] },
    { number: 26, from: 'naesbyhoved', to: 'maylandskoven', kind: 'explore', via: [] },
    { number: 27, from: 'maylandskoven', to: 'stavis', kind: 'explore', via: [] },
    { number: 28, from: 'bolbro', to: 'stavis', kind: 'explore', via: [] },
    { number: 29, from: 'stavis', to: 'odins', kind: 'explore', via: [] },
    { number: 30, from: 'odins', to: 'kirkendrup', kind: 'explore', via: [] },
    { number: 31, from: 'kirkendrup', to: 'lumby', kind: 'explore', via: [] },
    { number: 32, from: 'odins', to: 'korup', kind: 'explore', via: [[10.3025, 55.4164]] },
    { number: 33, from: 'korup', to: 'holeskov', kind: 'explore', via: [] },
    { number: 34, from: 'tusindaar', to: 'sanderum', kind: 'explore', via: [] },
    { number: 35, from: 'tusindaar', to: 'elmelund', kind: 'explore', via: [] },
    { number: 36, from: 'elmelund', to: 'sanderum', kind: 'explore', via: [] },
    { number: 37, from: 'elmelund', to: 'hesbjerg', kind: 'explore', via: [[10.255, 55.378]] },
    { number: 38, from: 'hesbjerg', to: 'braendekilde', kind: 'explore', via: [] },
    { number: 39, from: 'sanderum', to: 'bellinge', kind: 'explore', via: [] },
    { number: 40, from: 'bellinge', to: 'braendekilde', kind: 'explore', via: [] },
    { number: 41, from: 'bellinge', to: 'stenloese', kind: 'explore', via: [[10.3493, 55.3401]] },
    { number: 42, from: 'fynskelandsby', to: 'stenloese', kind: 'explore', via: [] },
    { number: 43, from: 'hollufgaard', to: 'hoejby', kind: 'explore', via: [] },
    { number: 44, from: 'hoejby', to: 'hjallese', kind: 'explore', via: [] },
    { number: 45, from: 'oerbaek', to: 'kohave', kind: 'explore', via: [] },
    { number: 46, from: 'hcaskoven', to: 'raeveskov', kind: 'explore', via: [] },
    { number: 47, from: 'hollufgaard', to: 'fraugde', kind: 'explore', via: [] },
    { number: 48, from: 'kohave', to: 'fraugde', kind: 'explore', via: [[10.4947, 55.3648]] },
    { number: 49, from: 'fraugde', to: 'romantiskehave', kind: 'explore', via: [] },
    { number: 50, from: 'romantiskehave', to: 'tarupdavinde', kind: 'explore', via: [] },
  ],
};
