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
      .regex(
        /^generated\/(sprites|markers|stamps|badges)\/[a-zA-Z0-9_]+\.svg$|^generated\/hint\.svg$/,
      ),
    kind: z.enum(['sprite', 'marker', 'hint', 'stamp', 'badge']),
    species: z.string().nullable(),
    source: z.string().regex(/^(code|ai:.+ prompt:.+|pack:https?:\/\/.+|artist:.+)$/),
    author: z.string().min(1),
    licence: z.enum(ALLOWED_LICENCES),
    placeholder: z.boolean(),
  })
  .strict();
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
/** Fonts (M2d): self-hosted and open-licensed only (SIL Open Font License 1.1). */
export const FONT_LICENCES = ['OFL-1.1'] as const;
export const FontEntrySchema = z
  .object({
    name: z.string().min(1),
    role: z.string().min(1),
    /** Where the files come from: an npm package bundled by the client, or files in public/. */
    files: z.string().regex(/^(npm:@fontsource\/[a-z-]+|public:fonts\/.+)$/),
    source: z.string().url(),
    author: z.string().min(1),
    licence: z.enum(FONT_LICENCES),
  })
  .strict();
export type FontEntry = z.infer<typeof FontEntrySchema>;

/** The game's fonts, written into assets.json by `pnpm art:build`. */
export const FONTS: FontEntry[] = [
  {
    name: 'Fraunces',
    role: 'headings (600, 700; Latin)',
    files: 'npm:@fontsource/fraunces',
    source: 'https://github.com/undercasetype/Fraunces',
    author: 'The Fraunces Project Authors (Undercase Type)',
    licence: 'OFL-1.1',
  },
  {
    name: 'Atkinson Hyperlegible',
    role: 'body text (400, 700; Latin)',
    files: 'npm:@fontsource/atkinson-hyperlegible',
    source: 'https://www.brailleinstitute.org/freefont/',
    author: 'Braille Institute of America',
    licence: 'OFL-1.1',
  },
  {
    name: 'Noto Sans',
    role: 'map labels (MapLibre glyph ranges)',
    files: 'public:fonts/Noto Sans Regular, Noto Sans Medium',
    source: 'https://github.com/protomaps/basemaps-assets',
    author: 'The Noto Project Authors (Google)',
    licence: 'OFL-1.1',
  },
];

export const AssetManifestSchema = z
  .object({ assets: z.array(AssetEntrySchema), fonts: z.array(FontEntrySchema) })
  .strict();
