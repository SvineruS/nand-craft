import { createElement, type ComponentChildren, type VNode } from 'preact';

/**
 * Just enough Markdown to render the README's own text inside the game.
 *
 * The point is that the in-game help *is* the README — one source, so a control that
 * changes cannot be documented in one place and stale in the other. That only holds if the
 * README's actual syntax renders, hence the subset here: headings, tables, bullet lists,
 * fenced code, paragraphs, and inline code / bold / italic / strikethrough / links.
 *
 * Output is Preact nodes rather than an HTML string: no `innerHTML`, so nothing in a
 * document can inject markup even if one day the text stops being ours.
 */

/**
 * A document without its `# Title` line, for rendering into a window that already shows
 * the title in its header. Leaves a document that does not start with one alone.
 */
export function dropTitle(source: string): string {
  const lines = source.split('\n');
  const first = lines.findIndex(line => line.trim() !== '');
  if (first < 0 || headingOf(lines[first])?.level !== 1) return source;
  return lines.slice(first + 1).join('\n');
}

export function renderMarkdown(source: string): VNode[] {
  const lines = source.split('\n');
  const blocks: VNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    // `<!-- … -->` is how a document keeps a note for whoever edits it out of what the
    // game shows. Skipped rather than rendered, which is also what GitHub does with it.
    if (line.trimStart().startsWith('<!--')) { i = skipComment(lines, i); continue; }

    const heading = headingOf(line);
    if (heading) {
      // Shifted down one level: the window's own title is the section heading, so the
      // README's `###` should not compete with it.
      blocks.push(createElement(`h${Math.min(heading.level + 1, 6)}`, { key: blocks.length },
        renderInline(heading.text)));
      i++;
      continue;
    }

    if (isFence(line)) i = pushCode(lines, i, blocks);
    else if (isTableStart(lines, i)) i = pushTable(lines, i, blocks);
    else if (isBullet(line)) i = pushList(lines, i, blocks);
    else i = pushParagraph(lines, i, blocks);
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Blocks
//
// Each takes the line it starts on and returns the line the caller should continue from.
// ---------------------------------------------------------------------------

function pushCode(lines: string[], start: number, blocks: VNode[]): number {
  let i = start + 1;
  const body: string[] = [];
  while (i < lines.length && !isFence(lines[i])) body.push(lines[i++]);

  blocks.push(
    <pre key={blocks.length}><code>{body.join('\n')}</code></pre>,
  );
  return i + 1;
}

function pushTable(lines: string[], start: number, blocks: VNode[]): number {
  const header = tableCells(lines[start]);
  let i = start + 2;   // the header row and the |---| divider under it
  const rows: string[][] = [];
  while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(tableCells(lines[i++]));

  blocks.push(
    <table key={blocks.length}>
      <thead>
        <tr>{header.map((cell, index) => <th key={index}>{renderInline(cell)}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{renderInline(cell)}</td>)}</tr>
        ))}
      </tbody>
    </table>,
  );
  return i;
}

function pushList(lines: string[], start: number, blocks: VNode[]): number {
  const items: string[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (isBullet(line)) {
      items.push(line.trim().slice(2));
      i++;
      continue;
    }
    // An indented line continues the item above it; anything else ends the list.
    if (items.length > 0 && line.startsWith('  ') && line.trim() !== '') {
      items[items.length - 1] += ` ${line.trim()}`;
      i++;
      continue;
    }
    break;
  }

  blocks.push(
    <ul key={blocks.length}>
      {items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}
    </ul>,
  );
  return i;
}

function pushParagraph(lines: string[], start: number, blocks: VNode[]): number {
  const parts: string[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || headingOf(line) || isFence(line) || isBullet(line)
      || isTableStart(lines, i)) break;
    parts.push(line.trim());
    i++;
  }

  // Soft line breaks are joined: the README wraps its prose at ~100 columns, and a window
  // is not that wide.
  blocks.push(<p key={blocks.length}>{renderInline(parts.join(' '))}</p>);
  return i;
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

/** `code`, **bold**, ~~struck~~, [link](url), *italic* — first match wins, left to right. */
const INLINE_PATTERN = /`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*/g;

function renderInline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let last = 0;

  // A fresh lastIndex per call — the pattern is a module-level global regex.
  INLINE_PATTERN.lastIndex = 0;
  for (let match = INLINE_PATTERN.exec(text); match; match = INLINE_PATTERN.exec(text)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(inlineNode(match, out.length));
    last = INLINE_PATTERN.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));

  return out;
}

function inlineNode(match: RegExpExecArray, key: number): VNode {
  const [, code, bold, struck, linkText, href, italic] = match;
  if (code !== undefined) return <code key={key}>{code}</code>;
  if (bold !== undefined) return <strong key={key}>{bold}</strong>;
  if (struck !== undefined) return <del key={key}>{struck}</del>;
  if (linkText !== undefined) {
    return <a key={key} href={href} target="_blank" rel="noreferrer">{linkText}</a>;
  }
  return <em key={key}>{italic}</em>;
}

// ---------------------------------------------------------------------------
// Line tests
// ---------------------------------------------------------------------------

function headingOf(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})\s+(.*?)\s*$/);
  return match ? { level: match[1].length, text: match[2] } : null;
}

/** The line after the comment that starts at `start`. */
function skipComment(lines: string[], start: number): number {
  let i = start;
  while (i < lines.length && !lines[i].includes('-->')) i++;
  return i + 1;
}

function isFence(line: string): boolean {
  return line.trimStart().startsWith('```');
}

function isBullet(line: string): boolean {
  return /^\s*[-*]\s/.test(line);
}

/** A table needs its header row and the `|---|---|` divider under it. */
function isTableStart(lines: string[], index: number): boolean {
  const next = lines[index + 1];
  return lines[index].trim().startsWith('|')
    && next !== undefined
    && /^\s*\|?[\s:|-]*-[\s:|-]*\|/.test(next);
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(cell => cell.trim());
}
