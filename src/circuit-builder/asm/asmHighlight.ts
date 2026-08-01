import { StreamLanguage, type StreamParser } from '@codemirror/language';

/**
 * Colouring for the default program syntax. A stream tokenizer rather than a grammar, for
 * the same reason as the test DSL's: the language is line-oriented and tiny.
 */

interface AsmState {
  /** A `#define` line colours its first name as the macro being defined. */
  afterDefine: boolean;
}

const asmParser: StreamParser<AsmState> = {
  startState: () => ({ afterDefine: false }),

  token(stream, state) {
    if (stream.sol()) state.afterDefine = false;
    if (stream.eatSpace()) return null;

    if (stream.match(/^(;|\/\/).*/)) return 'comment';

    if (stream.match(/^#[A-Za-z_][A-Za-z0-9_]*/)) {
      state.afterDefine = stream.current() === '#define';
      return 'meta';
    }

    if (stream.match(/^"([^"\\]|\\.)*"?/) || stream.match(/^'([^'\\]|\\.)*'?/)) return 'string';

    if (stream.match(/^0[xXbBoO][0-9a-fA-F_]+/) || stream.match(/^[0-9][0-9_]*/)) return 'number';

    if (stream.match(/^[A-Za-z_.][A-Za-z0-9_.]*/)) {
      if (state.afterDefine) {
        state.afterDefine = false;
        return 'macroName';
      }
      // A name followed by ":" is a label definition.
      return stream.peek() === ':' ? 'labelName' : 'variableName';
    }

    if (stream.match(/^(<<|>>|[-+*/%&|^~(),:])/)) return 'punctuation';

    stream.next();
    return null;
  },
};

export const asmLanguage = StreamLanguage.define(asmParser);
