/**
 * Contract between the RAM program editor and whatever turns source text into bytes.
 *
 * The editor knows nothing about a particular syntax: it hands a Preprocessor the source
 * and a way to read other files, and gets back an image plus diagnostics. That is what
 * makes a second (custom / DLC) preprocessor a registry entry rather than a rewrite.
 */

/** A problem found while assembling, pointing at the line it came from. */
export interface AsmDiagnostic {
  /** 1-based line number inside `file`. */
  line: number;
  message: string;
  /** File the line belongs to. Differs from the edited file for included lines. */
  file: string;
}

/** A name the program bound to a number — a label or a constant define. */
export interface AsmSymbol {
  name: string;
  value: number;
  kind: 'label' | 'define';
}

export interface AssembleResult {
  /**
   * Assembled image, index = memory address, trimmed to the highest written byte.
   * Always present: a program with errors still shows whatever did assemble.
   */
  bytes: number[];
  errors: AsmDiagnostic[];
  symbols: AsmSymbol[];
}

/** A file pulled in by an include, with the path it actually resolved to. */
export interface ResolvedFile {
  path: string;
  content: string;
}

export interface AssembleRequest {
  source: string;
  /** Path of `source`, so a relative include can resolve against its folder. */
  path: string;
  /**
   * Resolve and read an included file. Path resolution lives with the file system, not
   * with the syntax, so a preprocessor never has to know how paths are spelled.
   */
  readFile: (spec: string, fromPath: string) => ResolvedFile | null;
  /** Addresses the target memory has. Emitting past the end is an error. */
  memorySize: number;
}

export interface Preprocessor {
  id: string;
  label: string;
  /** One line, shown next to the name in the editor's preprocessor picker. */
  description: string;
  assemble: (request: AssembleRequest) => AssembleResult;
}