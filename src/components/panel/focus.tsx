"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

/**
 * Stops a mouse press on a button from moving the focus to it, so the focus stays on the canvas
 * or in the text editor: arrow keys keep nudging the selection and an edited label stays open
 * while its style changes.
 *
 * @param event - Mouse press inside the guarded chrome
 */
function keepFocus(event: MouseEvent<HTMLElement>): void {
    if (event.button === 0 && event.target instanceof Element && event.target.closest("button")) {
        event.preventDefault();
    }
}

/**
 * Keeps Enter and Space on a focused button for the button itself: the global shortcut handler
 * listening on the window would otherwise turn them into "edit text" or "pan" and cancel the
 * click.
 *
 * @param event - Key event bubbling out of the guarded chrome
 */
function keepActivationKeys(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target instanceof HTMLButtonElement) event.stopPropagation();
}

/**
 * Layout-neutral wrapper (display: contents) of a piece of editor chrome such as the tool dock
 * or the properties panel, reconciling its buttons with the keyboard shortcuts of the canvas:
 * buttons only take the focus from the keyboard, and then own their activation keys.
 *
 * @param children - Chrome to guard; only the buttons inside are affected, and no ref or DOM box
 * is added around them
 * @returns A display: contents wrapper that adds no box to the layout
 */
export function FocusGuard({ children }: { children: ReactNode }) {
    return (
        <div className="contents" onMouseDown={keepFocus} onKeyDown={keepActivationKeys}>
            {children}
        </div>
    );
}
