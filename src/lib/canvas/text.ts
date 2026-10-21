import { getFont } from "@/data/fonts";
import type { WispenElement } from "@/types/scene";

// Line height as a multiple of the font size.
export const LINE_HEIGHT = 1.25;

// Inner margin between a shape outline and its label, in scene pixels.
export const LABEL_PADDING = 10;

export interface TextLayout {
    lines: string[];
    width: number;
    height: number;
    lineHeight: number;
}

type TextStyle = Pick<WispenElement, "fontFamily" | "fontSize" | "fontWeight" | "fontStyle">;

// Layouts kept before the cache is cleared, by count and by total text length in characters.
const CACHE_ENTRIES = 2000;
const CACHE_CHARACTERS = 2_000_000;

let context: CanvasRenderingContext2D | null = null;
const familyCache = new Map<string, string>();
const layoutCache = new Map<string, TextLayout>();
let cachedCharacters = 0;

/**
 * Resolves a font id to the concrete font-family list set by next/font on the document root.
 * Results are cached until invalidateTextCache runs.
 *
 * @param id - Font id from the catalog
 * @returns A font-family value usable outside the page, e.g. in canvas or exported SVG
 */
export function resolveFontFamily(id: string): string {
    const cached = familyCache.get(id);
    if (cached) return cached;
    const font = getFont(id);
    let family = "";
    if (typeof document !== "undefined") {
        family = getComputedStyle(document.documentElement).getPropertyValue(font.variable).trim();
    }
    const value = family ? `${family}, ${font.fallback}` : `${font.label}, ${font.fallback}`;
    familyCache.set(id, value);
    return value;
}

/**
 * Builds the CSS font shorthand of a text style.
 *
 * @param style - Font properties read from an element
 * @returns A shorthand such as "italic bold 20px Nunito, sans-serif"
 */
export function fontShorthand(style: TextStyle): string {
    return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${resolveFontFamily(style.fontFamily)}`;
}

/**
 * Measures the rendered width of a single line.
 *
 * @param text - Line without line breaks
 * @param font - CSS font shorthand
 * @returns Width in CSS pixels, approximated from the character count without a DOM
 */
function measure(text: string, font: string): number {
    if (!context && typeof document !== "undefined") {
        context = document.createElement("canvas").getContext("2d");
    }
    if (!context) return text.length * 10;
    context.font = font;
    return context.measureText(text).width;
}

/**
 * Finds the longest prefix of a text that fits a width, galloping to an overflowing prefix and
 * then bisecting. Only prefixes up to twice the line length are measured, so breaking a long
 * word costs a logarithmic number of short measures per line.
 *
 * @param text - Text to cut, at least two characters long
 * @param font - CSS font shorthand
 * @param maxWidth - Wrapping width in scene pixels
 * @returns The prefix length: the whole text when it fits, at least 1 even when a single
 * character overflows
 */
function fittingLength(text: string, font: string, maxWidth: number): number {
    let fit = 1;
    let over = 2;
    while (over < text.length && measure(text.slice(0, over), font) <= maxWidth) {
        fit = over;
        over *= 2;
    }
    if (over >= text.length) {
        if (measure(text, font) <= maxWidth) return text.length;
        over = text.length;
    }
    while (over - fit > 1) {
        const middle = Math.floor((fit + over) / 2);
        if (measure(text.slice(0, middle), font) <= maxWidth) fit = middle;
        else over = middle;
    }
    return fit;
}

/**
 * Splits one paragraph into lines no wider than maxWidth, breaking inside words only when a
 * single word is wider than the line.
 *
 * @param paragraph - Text without line breaks
 * @param font - CSS font shorthand
 * @param maxWidth - Wrapping width; Infinity disables wrapping
 * @returns The wrapped lines, at least one
 */
function wrapParagraph(paragraph: string, font: string, maxWidth: number): string[] {
    if (!Number.isFinite(maxWidth) || measure(paragraph, font) <= maxWidth) return [paragraph];

    const lines: string[] = [];
    let current = "";
    for (const word of paragraph.split(/(\s+)/)) {
        const candidate = current + word;
        if (measure(candidate, font) <= maxWidth) {
            current = candidate;
            continue;
        }
        if (current === "") {
            current = candidate;
        } else {
            lines.push(current.trimEnd());
            current = word.trimStart();
        }

        while (current.length > 1) {
            const cut = fittingLength(current, font, maxWidth);
            if (cut >= current.length) break;
            lines.push(current.slice(0, cut));
            current = current.slice(cut);
        }
    }
    lines.push(current.trimEnd());
    return lines;
}

/**
 * Lays text out in lines for a given style and width. Results are memoized per text, style
 * and width, so calling it on every render stays cheap; the cache is bounded by entry count and
 * by total text length.
 *
 * @param text - Raw text, line breaks included
 * @param style - Font properties read from the element
 * @param maxWidth - Wrapping width in scene pixels; Infinity keeps each paragraph on one line
 * @returns The lines and the size of the block
 */
export function layoutText(text: string, style: TextStyle, maxWidth: number): TextLayout {
    const font = fontShorthand(style);
    const key = `${font}|${maxWidth}|${text}`;
    const cached = layoutCache.get(key);
    if (cached) return cached;

    const lines = text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, font, maxWidth));
    const lineHeight = style.fontSize * LINE_HEIGHT;
    const layout: TextLayout = {
        lines,
        width: Math.max(0, ...lines.map((line) => measure(line, font))),
        height: lines.length * lineHeight,
        lineHeight,
    };

    if (layoutCache.size >= CACHE_ENTRIES || cachedCharacters + text.length > CACHE_CHARACTERS) {
        layoutCache.clear();
        cachedCharacters = 0;
    }
    layoutCache.set(key, layout);
    cachedCharacters += text.length;
    return layout;
}

/**
 * Drops cached font families and layouts, to be called once web fonts finish loading since
 * earlier measurements used fallback fonts.
 */
export function invalidateTextCache(): void {
    familyCache.clear();
    layoutCache.clear();
    cachedCharacters = 0;
}
