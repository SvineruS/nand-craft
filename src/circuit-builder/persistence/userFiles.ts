import { createFileStore } from './fileStore.ts';

/**
 * The kinds of file a player writes, one store each.
 *
 * Extensions are enforced rather than suggested (see `FileStore.withExtension`): the player
 * never has to think about them, every file in a list looks like the same kind of thing, and
 * a reference can be typed exactly as the name reads in the explorer.
 */

/** RAM programs — source for the bytes flashed into a chip. */
export const programFiles = createFileStore({
  storageKey: 'nand-craft:programs',
  extension: '.asm',
  label: 'programs',
});

/** Test suites written in the test DSL. */
export const testFiles = createFileStore({
  storageKey: 'nand-craft:tests',
  extension: '.test',
  label: 'tests',
});
