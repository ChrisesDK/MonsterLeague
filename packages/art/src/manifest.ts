import { z } from 'zod';

/** Licences allowed in this public repo (GDD "Creature art pipeline"). */
export const ALLOWED_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'own', 'artist-licence'] as const;

/**
 * One asset-manifest entry. `source` is "code" (generated here), "ai:<tool> prompt:<text>",
 * "pack:<url>" or "artist:<name>". CC-BY needs an author for the credits.
 */
export const AssetEntrySchema = z
  .object({
    file: z
      .string()
      .regex(/^generated\/(sprites|markers)\/[a-z0-9_]+\.svg$|^generated\/hint\.svg$/),
    kind: z.enum(['sprite', 'marker', 'hint']),
    species: z.string().nullable(),
    source: z.string().regex(/^(code|ai:.+ prompt:.+|pack:https?:\/\/.+|artist:.+)$/),
    author: z.string().min(1),
    licence: z.enum(ALLOWED_LICENCES),
    placeholder: z.boolean(),
  })
  .strict();
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export const AssetManifestSchema = z.object({ assets: z.array(AssetEntrySchema) }).strict();
