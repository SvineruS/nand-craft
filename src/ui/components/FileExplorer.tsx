import type { StoredFile } from '../../circuit-builder/persistence/fileStore.ts';
import { folderOf, nameOf } from '../../circuit-builder/persistence/fileStore.ts';

/**
 * File list for a file-backed editor — the RAM program editor and the test editor use the
 * same one.
 *
 * Folders are not stored anywhere: they are the prefixes of the paths, grouped here for
 * display. Naming a file `cpu/ops` creates the folder as a side effect.
 */

interface FileExplorerProps {
  files: StoredFile[];
  openPath: string | null;
  dirty: boolean;
  onOpen: (path: string) => void;
  onCreate: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

export function FileExplorer(props: FileExplorerProps) {
  const { files, openPath, dirty, onOpen, onCreate, onRename, onDelete } = props;
  const folders = groupByFolder(files);

  return (
    <div class="file-explorer">
      <div class="file-explorer-head">
        <span>Files</span>
        <button class="window-btn" title="New file" onClick={onCreate}>+</button>
      </div>

      <div class="file-explorer-list">
        {files.length === 0 && <div class="file-explorer-empty">No files yet</div>}

        {folders.map(([folder, folderFiles]) => (
          <div key={folder || '/'}>
            {folder !== '' && <div class="file-explorer-folder">{folder}/</div>}
            {folderFiles.map(file => (
              <div
                key={file.path}
                class={`file-row${file.path === openPath ? ' is-open' : ''}`}
                onClick={() => onOpen(file.path)}
              >
                <span class="file-row-name" title={file.path}>
                  {nameOf(file.path)}{file.path === openPath && dirty ? ' •' : ''}
                </span>
                <span class="file-row-actions">
                  <button
                    class="file-row-action"
                    title="Rename"
                    onClick={e => { e.stopPropagation(); onRename(file.path); }}
                  >✎</button>
                  <button
                    class="file-row-action"
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
function groupByFolder(files: StoredFile[]): [string, StoredFile[]][] {
  const groups = new Map<string, StoredFile[]>();
  for (const file of files) {
    const folder = folderOf(file.path);
    const bucket = groups.get(folder);
    if (bucket) bucket.push(file);
    else groups.set(folder, [file]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
