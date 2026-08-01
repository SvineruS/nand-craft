import type { Preprocessor } from './types.ts';
import { defaultPreprocessor } from './defaultPreprocessor.ts';

/**
 * Registry of program syntaxes a program can be assembled with.
 *
 * Nothing picks a syntax yet — `assembleProgram` always asks for the default. The lookup is
 * by id and falls back to the default, so whatever ends up choosing one (most likely a
 * directive in the program itself) cannot break the editor by naming a syntax that is not
 * installed.
 */

const preprocessors = new Map<string, Preprocessor>();

export const DEFAULT_PREPROCESSOR_ID = defaultPreprocessor.id;

export function registerPreprocessor(preprocessor: Preprocessor): void {
  preprocessors.set(preprocessor.id, preprocessor);
}

/** The named preprocessor, or the default one when nothing is registered under that id. */
export function getPreprocessor(id: string): Preprocessor {
  return preprocessors.get(id) ?? defaultPreprocessor;
}

registerPreprocessor(defaultPreprocessor);
