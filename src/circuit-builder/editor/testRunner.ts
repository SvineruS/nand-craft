/**
 * What the two test modes have in common, so nothing above them has to know which is running.
 *
 * There genuinely are two engines: a truth table applies a row's inputs and compares outputs,
 * while a queue run ticks the circuit and advances only as far as its handshake allows. What
 * used to be shared was the *dispatch* — `LevelTests` branched on mode in `step`, `allPassed`
 * and `finished`, and then `useTestControls` branched on it again to pick which pair of
 * methods to call. The mode is now chosen once, here.
 */
export interface TestRunner {
  /**
   * Advance one unit: the next case in table mode, one tick in queue mode.
   * Returns false when the run is over — finished, or stopped by a failure.
   */
  step(): boolean;

  /** Begin again from the top, discarding progress but keeping the test definition. */
  restart(): void;

  /** Discard progress and return to the not-yet-started state. */
  reset(): void;

  /** Re-apply the current position after a value-only edit, without advancing. */
  retick(): void;

  /** Whether a paused run can be picked up where it left off instead of restarted. */
  readonly canResume: boolean;

  /** Whether every case or command has been checked and passed. */
  readonly allPassed: boolean;

  /** Whether a case or command has failed, which is also what stopped the run. */
  readonly failed: boolean;

  /** Ticks spent so far, shown in the test panel header. */
  readonly tickCount: number;

  /**
   * 1-based line of the test file the run is on — the row last applied, the command being
   * awaited — for the test editor to mark. Null when nothing is running, or when the
   * definition did not come from a test file (a level's own cases have no source text).
   */
  readonly sourceLine: number | null;

  /** How often an animated run steps this engine. A table row is worth watching; a tick isn't. */
  readonly stepIntervalMs: number;
}
