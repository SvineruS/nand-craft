import { playSfx } from '../circuit-builder/sfx.ts';

/**
 * Click and hover sounds for the whole interface, from two delegated listeners.
 *
 * On the document rather than on the controls: there are a hundred-odd buttons across the
 * toolbars, panels, windows and dialogs, and a sound each would be a hundred handlers to add and
 * one to forget on the next button anybody writes. Here, a control is audible because it is a
 * control.
 *
 * A press that already answers for itself opts out with `data-sfx="off"` — the test panel's Step,
 * whose whole job is to make a sound of its own.
 */

/** Things that behave as buttons. The sidebar's gate entries are divs, being drag sources. */
const CONTROL = 'button, .sidebar-item, [role="button"]';

/** A control that will not act. Refusal is worth hearing — it is not the same as silence. */
const REFUSING = ':disabled, .sidebar-item-disabled, [aria-disabled="true"]';

export function installUiSounds(): void {
  /** The control the pointer is on, so crossing between a button's own children is not re-entry. */
  let hovered: Element | null = null;

  document.addEventListener('pointerover', event => {
    // Touch has no hover: a tap would fire this and the press together.
    if (event.pointerType === 'touch') return;

    const control = controlAt(event);
    if (control === hovered) return;
    hovered = control;
    if (control && !control.matches(REFUSING)) playSfx('uiHover');
  });

  // On press rather than on click, so the sound lands with the finger. A keyboard-activated
  // button is therefore silent, which is the trade for not sounding twice on a mouse press.
  document.addEventListener('pointerdown', event => {
    const control = controlAt(event);
    if (!control || control.getAttribute('data-sfx') === 'off') return;
    playSfx(control.matches(REFUSING) ? 'blocked' : 'uiClick');
  });
}

/** The control an event happened inside, or null if it happened somewhere else. */
function controlAt(event: Event): Element | null {
  const target = event.target;
  return target instanceof Element ? target.closest(CONTROL) : null;
}
