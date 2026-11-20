import { ZodError } from 'zod';
import { checkContent, checkI18n, i18n, parseContent, rawContent, type Dex } from './index';

function main(): number {
  let dex: Dex;
  try {
    dex = parseContent(rawContent);
  } catch (err) {
    if (err instanceof ZodError) {
      for (const issue of err.issues)
        console.error(`schema: ${issue.path.join('.')}: ${issue.message}`);
    } else {
      console.error(err);
    }
    return 1;
  }
  const errors = [...checkContent(dex), ...checkI18n(dex, i18n)];
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} content error(s).`);
    return 1;
  }
  console.log(
    `✓ content valid: ${dex.typeIds.length} types, ${Object.keys(dex.species).length} species, ` +
      `${Object.keys(dex.moves).length} moves, ${Object.keys(dex.items).length} items, ` +
      `${Object.keys(dex.trainers).length} trainers, ${Object.keys(i18n.en).length} i18n keys × 2 locales`,
  );
  return 0;
}

process.exit(main());
