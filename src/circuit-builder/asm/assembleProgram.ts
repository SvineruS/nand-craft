import type { AssembleResult } from './types.ts';
import { getPreprocessor } from './registry.ts';
import { resolveInclude } from '../persistence/programFs.ts';
import { RAM_SIZE } from '../simulation/gateTypes.ts';

/**
 * Assemble a program for a RAM gate: the chosen preprocessor, the program file system as
 * its include source, and the RAM's size as its address limit.
 *
 * One entry point, so the editor's live error underlining and its Flash button can never
 * disagree about what the source assembles to.
 */
export function assembleProgram(source: string, path: string, preprocessorId: string): AssembleResult {
  return getPreprocessor(preprocessorId).assemble({
    source,
    path,
    readFile: resolveInclude,
    memorySize: RAM_SIZE,
  });
}
