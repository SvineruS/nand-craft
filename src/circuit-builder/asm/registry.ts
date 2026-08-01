import type { Preprocessor } from './types.ts';
import { defaultPreprocessor } from './defaultPreprocessor.ts';

/**
 * Registry of program syntaxes the RAM editor can assemble with.
 *
 * The editor stores the *id* of the preprocessor a player picked, so a syntax that is not
 * installed (a DLC one, on a save that has it selected) resolves back to the default
 * instead of breaking the dialog.
 */

const preprocessors = new Map<string, Preprocessor>();

export const DEFAULT_PREPROCESSOR_ID = defaultPreprocessor.id;

export function registerPreprocessor(preprocessor: Preprocessor): void {
  preprocessors.set(preprocessor.id, preprocessor);
}

export function listPreprocessors(): Preprocessor[] {
  return [...preprocessors.values()];
}

/** The named preprocessor, or the default one when nothing is registered under that id. */
export function getPreprocessor(id: string): Preprocessor {
  return preprocessors.get(id) ?? defaultPreprocessor;
}

registerPreprocessor(defaultPreprocessor);
