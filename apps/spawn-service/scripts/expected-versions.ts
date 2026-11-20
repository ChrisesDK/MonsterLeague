/** Prints the versions this commit's Worker should report (used by the deploy workflow). */
import { content } from '@oml/data';
import regionVersion from '@oml/data/region/odense.version.json';
import { spawnRulesVersion } from '@oml/spawn';

console.log(
  JSON.stringify({
    regionData: regionVersion.dataVersion,
    spawnRules: spawnRulesVersion(content.spawns),
  }),
);
