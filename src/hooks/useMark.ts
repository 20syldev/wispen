import { useState } from "react";

// Number of pencil strokes drawn under dialog titles, matching the data-mark rules of widgets.css.
const MARK_VARIANTS = 6;

/**
 * Picks the pencil stroke drawn under a dialog title, once per mount so every dialog opens with
 * a different one while a given title keeps its stroke.
 *
 * @returns Index of the stroke, to set as the data-mark attribute of the title
 */
export function useMark(): number {
    const [variant] = useState(() => Math.floor(Math.random() * MARK_VARIANTS));
    return variant;
}
