import controls from '../../../docs/controls.md?raw';
import { dropTitle, renderMarkdown } from '../markdown.tsx';
import { FloatingWindow } from './FloatingWindow.tsx';

/**
 * `docs/controls.md`, rendered in-game.
 *
 * The document is imported as raw text and parsed at module load rather than copied into
 * markup: it is the single source the README links to as well, which is what stops the
 * in-game list from drifting from the documented one.
 */
const CONTROLS = dropTitle(controls);

export function ControlsWindow({ onClose }: { onClose: () => void }) {
  return (
    <FloatingWindow id="controls" class="window-controls" title="Controls" onClose={onClose}>
      <div class="markdown-body">{renderMarkdown(CONTROLS)}</div>
    </FloatingWindow>
  );
}
