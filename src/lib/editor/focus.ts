import type { RefObject } from "react";

/**
 * Remembers the element focused when a dialog opens, from its open auto-focus event, before the
 * focus moves into the dialog. Dialogs opened through the editor store have no Radix trigger to
 * give the focus back to.
 *
 * @param target - Ref receiving the focused element, or null when nothing focusable had the focus
 */
export function rememberFocus(target: RefObject<HTMLElement | SVGElement | null>): void {
    const focused = document.activeElement;
    target.current =
        focused instanceof HTMLElement || focused instanceof SVGElement ? focused : null;
}

/**
 * Gives the focus back to the element remembered by rememberFocus when a dialog closes, instead
 * of letting it fall to the page body. Does nothing when that element left the page, or when the
 * focus already moved into another dialog opened in its place.
 *
 * @param event - Close auto-focus event of the dialog, prevented when the focus is given back
 * @param target - Ref filled by rememberFocus, emptied here
 */
export function restoreFocus(
    event: Event,
    target: RefObject<HTMLElement | SVGElement | null>,
): void {
    const element = target.current;
    target.current = null;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    if (!element?.isConnected || element === document.body) return;
    event.preventDefault();
    element.focus();
}
