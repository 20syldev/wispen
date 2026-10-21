import { getFont } from "@/data/fonts";
import { invalidateTextCache, layoutText, resolveFontFamily } from "@/lib/canvas/text";
import type { RenderContext } from "@/types/plugin";
import type { Arrowhead, StrokeStyle, WispenElement } from "@/types/scene";

/**
 * Catalog font id for each excalidraw font number. The numbers stand for Virgil (1), Helvetica
 * (2), Cascadia (3), Assistant (4), Excalifont (5), Nunito (6), Lilita One (7), Comic Shanns (8)
 * and Liberation Sans (9).
 */
const FONTS_IN: Record<number, string> = {
    1: "caveat",
    2: "inter",
    3: "jetbrains-mono",
    4: "inter",
    5: "caveat",
    6: "nunito",
    7: "bricolage",
    8: "comic-neue",
    9: "inter",
};

// Excalidraw fonts matching a catalog font closely; other fonts are mapped by category.
const FONTS_OUT: Record<string, number> = {
    nunito: 6,
    bricolage: 7,
    "jetbrains-mono": 3,
    caveat: 5,
    "comic-neue": 8,
};

/**
 * Catalog fonts standing in for the excalidraw fonts when measuring text, with the width of
 * the excalidraw font relative to its stand-in (measured on excalidraw.com), since excalidraw
 * draws text clipped to the width written in the file.
 */
const STAND_INS: Record<number, { font: string; ratio: number }> = {
    2: { font: "inter", ratio: 0.94 },
    3: { font: "jetbrains-mono", ratio: 0.98 },
    5: { font: "architects-daughter", ratio: 1.06 },
    6: { font: "nunito", ratio: 1 },
    7: { font: "bricolage", ratio: 0.91 },
    8: { font: "comic-neue", ratio: 1.21 },
};

// Extra width given to measured text, so rounding differences never clip a glyph.
const WIDTH_MARGIN = 1.04;

// Excalidraw arrowheads without an exact equivalent fall back to the closest look.
const ARROWHEADS_IN: Record<string, Arrowhead> = {
    arrow: "arrow",
    bar: "bar",
    dot: "dot",
    circle: "dot",
    circle_outline: "dot",
    triangle: "triangle",
    triangle_outline: "triangle",
    diamond: "triangle",
    diamond_outline: "triangle",
};

const ARROWHEADS_OUT: Record<Arrowhead, string | null> = {
    none: null,
    arrow: "arrow",
    triangle: "triangle",
    dot: "circle",
    bar: "bar",
};

// Default excalidraw inks, current and legacy, mapped to the palette ink to follow the theme.
const INK_COLORS = new Set(["#1e1e1e", "#000000", "#000"]);

/**
 * Maps an excalidraw font number to a font id of the catalog.
 *
 * @param family - Font number read from a text element; unknown values give Caveat, the
 * closest to the hand-drawn excalidraw default
 * @returns The catalog font id of that number, or caveat when the number is unknown
 */
export function importFont(family: unknown): string {
    return (typeof family === "number" && FONTS_IN[family]) || "caveat";
}

/**
 * Maps a font id of the catalog to the closest excalidraw font number: an exact match when
 * excalidraw ships the font, otherwise Excalifont for handwriting, Cascadia for monospace,
 * Lilita One for display faces and Helvetica for the rest.
 *
 * @param id - Font id stored on an element
 * @returns The font number to write: an exact match when it exists, else the category fallback
 */
export function exportFont(id: string): number {
    if (FONTS_OUT[id]) return FONTS_OUT[id];
    const font = getFont(id);
    if (font.fallback === "cursive") return 5;
    if (font.category === "mono") return 3;
    if (font.category === "display") return 7;
    return 2;
}

/**
 * Lays text out as excalidraw will draw it in a given font: wrapped with a stand-in catalog
 * font scaled to the excalidraw font width, without bold or italic which excalidraw lacks.
 *
 * @param element - Element read for its text and font size
 * @param family - Excalidraw font number the text is exported with
 * @param maxWidth - Wrapping width in pixels; Infinity keeps each paragraph on one line
 * @returns The wrapped lines and the size of the block in the excalidraw font
 */
export function measureText(
    element: WispenElement,
    family: number,
    maxWidth: number,
): { lines: string[]; width: number; height: number } {
    const standIn = STAND_INS[family] ?? { font: element.fontFamily, ratio: 1 };
    const style = {
        fontFamily: standIn.font,
        fontSize: element.fontSize,
        fontWeight: "normal" as const,
        fontStyle: "normal" as const,
    };
    const layout = layoutText(element.text, style, maxWidth / standIn.ratio);
    return {
        lines: layout.lines,
        width: Math.ceil(layout.width * standIn.ratio * WIDTH_MARGIN) + 2,
        height: layout.height,
    };
}

/**
 * Loads the catalog fonts used to measure labels in excalidraw fonts. Fonts load lazily in
 * the page, and measuring with a fallback font would underestimate the widths; layouts cached
 * with the fallback are dropped once a font arrives. Only the primary family is requested,
 * since a missing local fallback face would reject the whole load.
 *
 * @param elements - Elements about to be exported; only those with a text need a font
 */
export async function loadStandIns(elements: WispenElement[]): Promise<void> {
    if (typeof document === "undefined" || !document.fonts) return;
    const fonts = new Set(
        elements
            .filter((element) => element.text)
            .map((element) => STAND_INS[exportFont(element.fontFamily)]?.font ?? element.fontFamily)
            .map((id) => `16px ${resolveFontFamily(id).split(",")[0].trim()}`),
    );
    const missing = [...fonts].filter((font) => !document.fonts.check(font));
    if (missing.length === 0) return;
    await Promise.all(missing.map((font) => document.fonts.load(font).catch(() => [])));
    invalidateTextCache();
}

/**
 * Maps an excalidraw arrowhead to one of the supported arrowheads.
 *
 * @param value - Arrowhead read from an arrow; null means no arrowhead
 * @returns The arrowhead, "arrow" for kinds without an equivalent (crow's feet)
 */
export function importArrowhead(value: unknown): Arrowhead {
    if (typeof value !== "string") return "none";
    return ARROWHEADS_IN[value] ?? "arrow";
}

/**
 * Maps an arrowhead to its excalidraw name.
 *
 * @param value - Arrowhead of a line or arrow, missing meaning none
 * @returns The excalidraw name, or null for no arrowhead
 */
export function exportArrowhead(value: Arrowhead | undefined): string | null {
    return ARROWHEADS_OUT[value ?? "none"];
}

/**
 * Converts an excalidraw color: the default ink becomes the palette ink so it follows the
 * theme, every other value is kept as written.
 *
 * @param value - Color read from the file
 * @param fallback - Color used when the value is missing or empty
 * @returns The fallback for a missing or blank value, the palette key ink for a default excalidraw
 * ink, otherwise the trimmed color
 */
export function importColor(value: unknown, fallback: string): string {
    if (typeof value !== "string" || !value.trim()) return fallback;
    const color = value.trim();
    return INK_COLORS.has(color.toLowerCase()) ? "ink" : color;
}

/**
 * Resolves a stored color to the concrete value written in an excalidraw file.
 *
 * @param ctx - Export render context of the light theme, resolving palette keys
 * @param value - Stored color: palette key, CSS color or "transparent"
 * @param tone - Saturated tone for strokes and text, soft tone for fills
 * @returns A CSS color, or "transparent"
 */
export function exportColor(ctx: RenderContext, value: string, tone: "stroke" | "fill"): string {
    const color = ctx.color(value, tone);
    return color === "none" ? "transparent" : color;
}

/**
 * Reads an excalidraw stroke style.
 *
 * @param value - Raw strokeStyle of the file; anything other than dashed or dotted gives solid
 * @returns A supported stroke style, solid when unknown
 */
export function importStrokeStyle(value: unknown): StrokeStyle {
    return value === "dashed" || value === "dotted" ? value : "solid";
}
