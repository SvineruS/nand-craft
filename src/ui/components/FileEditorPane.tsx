import type { ComponentChildren } from 'preact';
import type { FileEditor, FileEditorStatus } from '../useFileEditor.ts';
import { FileExplorer } from './FileExplorer.tsx';

/**
 * The layout every file-backed editor shares: a file list that can be tucked away, a
 * toolbar over the document, and a status line under it.
 *
 * What differs between the RAM program editor and the test editor is the document widget
 * (passed as children) and the buttons that act on it (passed as `actions`) — never the
 * furniture around them.
 */

interface FileEditorPaneProps {
  editor: FileEditor;
  status: FileEditorStatus | null;
  /** Buttons placed after Save, e.g. Assemble / Flash, or Apply. */
  actions?: ComponentChildren;
  /** The document widget, and anything shown in its place (a help panel). */
  children?: ComponentChildren;
}

/**
 * The **?** that swaps the document for a syntax reference.
 *
 * Styled as a toggle rather than an action — like the file-list button beside it — because
 * pressing it changes what the window is showing rather than doing something once.
 */
export function HelpToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      class={`window-tab is-icon${open ? ' is-active' : ''}`}
      title={open ? 'Back to the editor' : 'Syntax help'}
      onClick={onToggle}
    >?</button>
  );
}

export function FileEditorPane({ editor, status, actions, children }: FileEditorPaneProps) {
  return (
    <div class="file-editor">
      {editor.showExplorer && (
        <FileExplorer
          files={editor.files}
          openPath={editor.path}
          dirty={editor.dirty}
          onOpen={editor.open}
          onCreate={editor.create}
          onRename={editor.rename}
          onDelete={editor.remove}
        />
      )}

      <div class="file-editor-main">
        <div class="window-toolbar">
          <button
            class={`window-tab is-icon${editor.showExplorer ? ' is-active' : ''}`}
            title={editor.showExplorer ? 'Hide the file list' : 'Show the file list'}
            onClick={editor.toggleExplorer}
          >{'☰'}</button>
          <span class="file-editor-path">
            {editor.path ?? 'untitled'}{editor.dirty ? ' •' : ''}
          </span>
          <div class="window-toolbar-spacer" />
          <button class="window-btn" onClick={editor.save}>Save</button>
          {actions}
        </div>

        {children}

        {status && (
          <div class={`file-editor-status${status.kind === 'error' ? ' is-error' : ''}`}>
            {status.text}
          </div>
        )}
      </div>
    </div>
  );
}
