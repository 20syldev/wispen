/**
 * Canvas palette keys; each maps to --canvas-<key> (stroke and text) and --canvas-<key>-soft
 * (fill) defined for both themes in globals.css.
 */
export const PALETTE = [
    "ink",
    "gray",
    "red",
    "orange",
    "yellow",
    "green",
    "teal",
    "blue",
    "violet",
    "pink",
] as const;

export type PaletteKey = (typeof PALETTE)[number];

// Fill-only key matching the canvas background, to mask what lies underneath.
export const PAPER = "paper";

export const TRANSPARENT = "transparent";

/**
 * Tells whether a stored color is a palette key rather than a raw CSS color.
 *
 * @param value - Color stored on an element: palette key, "paper", "transparent" or a CSS color
 * @returns true for palette keys and the paper key
 */
export function isPaletteKey(value: string): value is PaletteKey | typeof PAPER {
    return value === PAPER || (PALETTE as readonly string[]).includes(value);
}

/**
 * Returns the CSS custom property holding a palette color.
 *
 * @param key - Palette key or the paper key
 * @param tone - "stroke" for the saturated tone, "fill" for the soft one
 * @returns The variable name, e.g. "--canvas-blue-soft"
 */
export function paletteVariable(key: PaletteKey | typeof PAPER, tone: "stroke" | "fill"): string {
    if (key === PAPER) return "--canvas-paper";
    return tone === "fill" ? `--canvas-${key}-soft` : `--canvas-${key}`;
}
