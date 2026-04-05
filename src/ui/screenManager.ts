import { hasEditor, getEditor } from '../circuit-builder/editorInstance.ts';
import { notifyStateChange, viewMode, type ViewMode } from './editorStore.ts';

/** Navigate to a view mode, pushing browser history for back/forward navigation. */
export function navigateTo(mode: ViewMode): void {
  // Save editor state when leaving the editor
  if (viewMode.value === 'editor' && hasEditor()) {
    getEditor().save();
  }
  viewMode.value = mode;
  history.pushState({ viewMode: mode }, '');
  notifyStateChange();
}

/** Alias for navigating back to level select from editor. */
export function switchToLevelMap(): void {
  navigateTo('levelSelect');
}

// Restore view mode on browser back/forward (mouse back/forward buttons)
window.addEventListener('popstate', (e) => {
  const mode = e.state?.viewMode as ViewMode | undefined;
  if (mode) {
    if (viewMode.value === 'editor' && hasEditor()) {
      getEditor().save();
    }
    viewMode.value = mode;
    notifyStateChange();
  }
});

// Set initial history state
history.replaceState({ viewMode: viewMode.value }, '');
