import type { ProgramFile } from '../../circuit-builder/persistence/programFs.ts';
import { folderOf, nameOf } from '../../circuit-builder/persistence/programFs.ts';

/**
 * File list for the RAM program editor.
 *
 * Folders are not stored anywhere — they are the prefixes of the paths, grouped here for
 * display. Creating `cpu/ops.asm` creates the folder as a side effect of the name.
 */

interface ProgramExplorerProps {
  files: ProgramFile[];
  openPath: string | null;
  dirty: boolean;
  onOpen: (path: string) => void;
  onCreate: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

export function ProgramExplorer(props: ProgramExplorerProps) {
  const { files, openPath, dirty, onOpen, onCreate, onRename, onDelete } = props;
  const folders = groupByFolder(files);

  return (
    <div class="program-explorer">
      <div class="program-explorer-head">
        <span>Files</span>
        <button class="window-btn" title="New program file" onClick={onCreate}>+</button>
      </div>

      <div class="program-explorer-list">
        {files.length === 0 && <div class="program-explorer-empty">No files yet</div>}

        {folders.map(([folder, folderFiles]) => (
          <div key={folder || '/'}>
            {folder !== '' && <div class="program-explorer-folder">{folder}/</div>}
            {folderFiles.map(file => (
              <div
                key={file.path}
                class={`program-file${file.path === openPath ? ' is-open' : ''}`}
                onClick={() => onOpen(file.path)}
              >
                <span class="program-file-name" title={file.path}>
                  {nameOf(file.path)}{file.path === openPath && dirty ? ' •' : ''}
                </span>
                <span class="program-file-actions">
                  <button
                    class="program-file-action"
                    title="Rename"
                    onClick={e => { e.stopPropagation(); onRename(file.path); }}
                  >✎</button>
                  <button
                    class="program-file-action"
                    title="Delete"
                    onClick={e => { e.stopPropagation(); onDelete(file.path); }}
                  >🗑</button>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Files bucketed by folder, root first, then folders alphabetically. */
function groupByFolder(files: ProgramFile[]): [string, ProgramFile[]][] {
  const groups = new Map<string, ProgramFile[]>();
  for (const file of files) {
    const folder = folderOf(file.path);
    const bucket = groups.get(folder);
    if (bucket) bucket.push(file);
    else groups.set(folder, [file]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
