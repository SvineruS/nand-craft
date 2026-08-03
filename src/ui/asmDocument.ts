import { StateField, type Extension } from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';
import { assembleProgram } from '../circuit-builder/asm/assembleProgram.ts';
import type { AssembleResult } from '../circuit-builder/asm/types.ts';

/**
 * The assembled program, held as CodeMirror state.
 *
 * Three things in the program editor need it, and all three need the same answer: the error
 * underlining, the gutter that shows a line's byte offset, and the highlight that follows the
 * address the chip is being asked for. Assembling in a StateField means it happens once per
 * document change and inside the transaction, so the gutter is never a keystroke behind the
 * text it is numbering.
 *
 * The addresses are the *current* text's, not the flashed image's — the useful reading while
 * a CPU is being debugged is "where in what I am looking at is it", and an edit shows up
 * immediately rather than after the next Flash.
 */

export interface AsmDocument {
  result: AssembleResult;
  /** Address of the first byte a line of the edited file emitted, by 1-based line number. */
  addressOfLine: ReadonlyMap<number, number>;
  /** Line of the edited file that emitted the byte living at an address. */
  lineOfAddress: ReadonlyMap<number, number>;
}

/**
 * A field holding the assembly of whatever the editor is showing.
 *
 * Built per editor rather than once at module scope, because assembling needs the path the
 * document is saved as — that is what a relative `#include` resolves against — and the path
 * is whichever file the player has open.
 */
export function asmDocumentField(getPath: () => string): StateField<AsmDocument> {
  return StateField.define<AsmDocument>({
    create: state => assembleDocument(state.doc.toString(), getPath()),
    update: (value, tr) => (
      tr.docChanged ? assembleDocument(tr.state.doc.toString(), getPath()) : value
    ),
  });
}

/**
 * A gutter of byte offsets: what address each line's first byte landed at.
 *
 * Shown instead of the line numbers, not beside them — the two answer the same question ("which
 * of these am I looking at") in the two notations that matter, and a line that emits no bytes
 * has no offset to show. Both gutters are mounted and the toolbar's toggle hides one in CSS,
 * so switching notation costs nothing and never disturbs the document.
 */
export function byteOffsetGutter(field: StateField<AsmDocument>): Extension {
  return gutter({
    class: 'cm-byteOffsets',
    lineMarker: (view, block) => {
      const line = view.state.doc.lineAt(block.from).number;
      return new OffsetMarker(view.state.field(field).addressOfLine.get(line), line);
    },
    // The offsets follow the text, and a document change already redraws every gutter.
    initialSpacer: () => new OffsetMarker(0, 0),
  });
}

/** The line whose bytes cover an address, for the highlight that follows the address pin. */
export function lineForAddress(doc: AsmDocument | undefined, address: number | null): number | null {
  if (!doc || address === null) return null;
  return doc.lineOfAddress.get(address) ?? null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assembleDocument(source: string, path: string): AsmDocument {
  const result = assembleProgram(source, path);
  // What `assembleProgram` calls the file it was handed, so lines from an #include — which
  // have their own numbering, in another document — are left out of both maps.
  const ownFile = path === '' ? '(unsaved)' : path;

  const addressOfLine = new Map<number, number>();
  const lineOfAddress = new Map<number, number>();
  for (const span of result.lineBytes) {
    if (span.file !== ownFile) continue;
    // A line reached twice (two #orgs, one label) reads as the first place it put bytes,
    // while an address reads as the line that wrote it last — which is the byte that is there.
    if (!addressOfLine.has(span.line)) addressOfLine.set(span.line, span.address);
    for (let i = 0; i < span.length; i++) lineOfAddress.set(span.address + i, span.line);
  }

  return { result, addressOfLine, lineOfAddress };
}

/**
 * One line's offset in the gutter, as two hex digits — the notation the memory window's
 * address column and its column headings already use.
 */
class OffsetMarker extends GutterMarker {
  private address: number | undefined;
  private line: number;

  constructor(address: number | undefined, line: number) {
    super();
    this.address = address;
    this.line = line;
  }

  eq(other: OffsetMarker): boolean {
    return other.address === this.address && other.line === this.line;
  }

  toDOM(): Node {
    const span = document.createElement('span');
    span.textContent = this.address === undefined
      ? ''
      : this.address.toString(16).toUpperCase().padStart(2, '0');
    // The line number is what this gutter replaced, so hovering still answers for it.
    span.title = `Line ${this.line}`;
    return span;
  }
}
