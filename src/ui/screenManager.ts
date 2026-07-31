import { notifyStateChange, viewMode, type ViewMode } from './editorStore.ts';

/**
 * Navigate to a view mode, pushing browser history for back/forward navigation.
 *
 * Saving is deliberately not done here: each editor screen owns its Editor and saves it in
 * its own teardown, which the view-mode change triggers by unmounting the screen.
 */
export function navigateTo(mode: ViewMode): void {
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
    viewMode.value = mode;
    notifyStateChange();
  }
});

// Set initial history state
history.replaceState({ viewMode: viewMode.value }, '');
