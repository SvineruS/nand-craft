import { StreamLanguage, type StreamParser } from '@codemirror/language';

const KEYWORDS = new Set(['write', 'read']);

interface DslState {
  inCaseDesc: boolean;
}

const dslParser: StreamParser<DslState> = {
  startState: () => ({ inCaseDesc: false }),

  token(stream, state) {
    // Case description — rest of line after @case
    if (state.inCaseDesc) {
      stream.skipToEnd();
      state.inCaseDesc = false;
      return 'labelName';
    }

    // Whitespace
    if (stream.eatSpace()) return null;

    // Comment
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Directives
    if (stream.match('@mode') || stream.match('@case') || stream.match('@inputs') || stream.match('@outputs')) {
      state.inCaseDesc = true;
      return 'meta';
    }

    // Pipe separator (table mode rows)
    if (stream.match('|')) {
      return 'punctuation';
    }

    // Number (hex, binary, decimal)
    if (stream.match(/^0[xX][0-9a-fA-F]+/) || stream.match(/^0[bB][01]+/) || stream.match(/^[0-9]+/)) {
      return 'number';
    }

    // Word
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current().toLowerCase();
      if (KEYWORDS.has(word)) return 'keyword';
      return 'variableName';
    }

    // Skip unknown character
    stream.next();
    return null;
  },
};

export const dslLanguage = StreamLanguage.define(dslParser);
