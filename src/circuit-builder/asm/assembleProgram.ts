import type { AssembleResult } from './types.ts';
import { DEFAULT_PREPROCESSOR_ID, getPreprocessor } from './registry.ts';
import { resolveInclude } from '../persistence/programFs.ts';
import { RAM_SIZE } from '../simulation/gateTypes.ts';

/**
 * Assemble a program for a RAM gate: the default preprocessor, the program file system as
 * its include source, and the RAM's size as its address limit.
 *
 * One entry point, so the editor's live error underlining and its Flash button can never
 * disagree about what the source assembles to. It is also where a program will come to say
 * which syntax it wants — the registry is already the thing that resolves it, so a directive
 * in the source can pick one here without any caller changing.
 */
export function assembleProgram(source: string, path: string): AssembleResult {
  return getPreprocessor(DEFAULT_PREPROCESSOR_ID).assemble({
    source,
    path,
    readFile: resolveInclude,
    memorySize: RAM_SIZE,
  });
}
