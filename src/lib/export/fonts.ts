import { resolveFontFamily } from "@/lib/canvas/text";
import { SVG_NS } from "@/lib/export/svg";
import { readAsDataUrl } from "@/lib/storage/images";
import type { WispenElement } from "@/types/scene";

interface FaceRule {
    rule: CSSFontFaceRule;
    base: string;
}

// Matches url(...) references, quoted or not; the second group holds the address.
const URL_PATTERN = /url\((["']?)(.*?)\1\)/g;

// Font files already converted to data URLs, by absolute URL, shared by every export.
const inlined = new Map<string, Promise<string>>();

/**
 * Removes the quotes around a CSS font family name.
 *
 * @param name - Family as written in CSS, quoted or not
 * @returns The bare family name
 */
function unquote(name: string): string {
    return name.trim().replace(/^(["'])(.*)\1$/, "$2");
}

/**
 * Returns the web font family behind a font id: the first family of its resolved list, the
 * others being local fallbacks.
 *
 * @param id - Font id from the catalog
 * @returns The family name, lowercase for comparisons
 */
function primaryFamily(id: string): string {
    return unquote(resolveFontFamily(id).split(",")[0] ?? "").toLowerCase();
}

/**
 * Collects the characters drawn with each font family.
 *
 * @param elements - Exported elements; those without text are ignored
 * @returns Code points by lowercase family name
 */
function charactersByFamily(elements: WispenElement[]): Map<string, Set<number>> {
    const result = new Map<string, Set<number>>();
    for (const element of elements) {
        if (!element.text) continue;
        const family = primaryFamily(element.fontFamily);
        const characters = result.get(family) ?? new Set<number>();
        for (const character of element.text) characters.add(character.codePointAt(0) ?? 0);
        result.set(family, characters);
    }
    return result;
}

/**
 * Parses a unicode-range descriptor such as "U+0-FF, U+131, U+4??".
 *
 * @param value - Raw unicode-range text of a font face, an empty string meaning no restriction
 * @returns Inclusive code point intervals, empty when the descriptor is empty (every character)
 */
function parseUnicodeRange(value: string): [number, number][] {
    const intervals: [number, number][] = [];
    for (const part of value.split(",")) {
        const token = part.trim().replace(/^u\+/i, "");
        if (!token) continue;
        const [start, end] = token.includes("?")
            ? [token.replace(/\?/g, "0"), token.replace(/\?/g, "F")]
            : [token.split("-")[0], token.split("-")[1] ?? token.split("-")[0]];
        const interval: [number, number] = [parseInt(start, 16), parseInt(end, 16)];
        if (Number.isFinite(interval[0]) && Number.isFinite(interval[1])) intervals.push(interval);
    }
    return intervals;
}

/**
 * Tells whether a font face is needed to draw some characters.
 *
 * @param range - unicode-range of the face, empty for faces covering everything
 * @param characters - Code points drawn with the family of the face
 * @returns true when at least one character falls in the range
 */
function coversAny(range: string, characters: Set<number>): boolean {
    const intervals = parseUnicodeRange(range);
    if (intervals.length === 0) return true;
    for (const code of characters) {
        if (intervals.some(([start, end]) => code >= start && code <= end)) return true;
    }
    return false;
}

/**
 * Collects the @font-face rules of a rule list, descending into conditional and layer blocks
 * and into imported style sheets.
 *
 * @param rules - Rules of a readable style sheet or block
 * @param base - URL the relative sources of these rules resolve against
 * @param faces - Receives the font faces, in document order
 */
function collectRules(rules: CSSRuleList, base: string, faces: FaceRule[]): void {
    for (const rule of Array.from(rules)) {
        if (rule instanceof CSSFontFaceRule) {
            faces.push({ rule, base });
        } else if (rule instanceof CSSImportRule && rule.styleSheet) {
            collectSheet(rule.styleSheet, faces);
        } else if (rule instanceof CSSGroupingRule && !(rule instanceof CSSStyleRule)) {
            // Style rules are grouping rules too since CSS nesting, but never hold font faces.
            collectRules(rule.cssRules, base, faces);
        }
    }
}

/**
 * Collects the @font-face rules of a style sheet. Sheets served by another origin cannot be
 * read and are skipped.
 *
 * @param sheet - Style sheet to read; one whose rules are unreadable (cross-origin) is skipped
 * @param faces - Receives the font faces, in document order
 */
function collectSheet(sheet: CSSStyleSheet, faces: FaceRule[]): void {
    let rules: CSSRuleList;
    try {
        rules = sheet.cssRules;
    } catch {
        return;
    }
    collectRules(rules, sheet.href ?? document.baseURI, faces);
}

/**
 * Lists the @font-face rules of the page.
 *
 * @returns Font faces with the base URL of their style sheet, in document order
 */
function pageFontFaces(): FaceRule[] {
    const faces: FaceRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) collectSheet(sheet, faces);
    return faces;
}

/**
 * Downloads a font file as a data URL, once per session.
 *
 * @param url - Absolute URL of the file
 * @returns The data URL; a failed download is forgotten so a later export retries it
 */
function inlineFile(url: string): Promise<string> {
    const cached = inlined.get(url);
    if (cached) return cached;
    const pending = fetch(url)
        .then((response) => {
            if (!response.ok) throw new Error(`Font request failed with status ${response.status}`);
            return response.blob();
        })
        .then(readAsDataUrl);
    pending.catch(() => inlined.delete(url));
    inlined.set(url, pending);
    return pending;
}

/**
 * Rewrites a font face so every file it references is inlined as a data URL.
 *
 * @param face - Rule and base URL of its style sheet
 * @returns The CSS text of the rule, or null when a file could not be downloaded
 */
async function inlineFace({ rule, base }: FaceRule): Promise<string | null> {
    const css = rule.cssText;
    const sources = Array.from(css.matchAll(URL_PATTERN), (match) => match[2]);
    try {
        const data = await Promise.all(
            sources.map((source) =>
                source.startsWith("data:") ? source : inlineFile(new URL(source, base).href),
            ),
        );
        let index = 0;
        return css.replace(URL_PATTERN, () => `url("${data[index++]}")`);
    } catch {
        return null;
    }
}

/**
 * Builds @font-face rules embedding the web fonts used by text elements. Only the faces whose
 * unicode-range covers characters actually drawn are kept, so a Latin text does not carry the
 * Cyrillic or Greek subsets.
 *
 * @param elements - Exported elements, of which only text and fontFamily are read
 * @returns CSS text, empty when no text uses a web font of the page
 */
export async function fontFaceCss(elements: WispenElement[]): Promise<string> {
    const characters = charactersByFamily(elements);
    if (characters.size === 0) return "";

    const faces = pageFontFaces().filter(({ rule }) => {
        const family = unquote(rule.style.getPropertyValue("font-family")).toLowerCase();
        const used = characters.get(family);
        return used !== undefined && coversAny(rule.style.getPropertyValue("unicode-range"), used);
    });
    const rules = await Promise.all(faces.map(inlineFace));
    return rules.filter((rule): rule is string => rule !== null).join("\n");
}

/**
 * Embeds the web fonts used by elements into an SVG document, so its text renders with the
 * right fonts in other applications and when drawn as an image, which cannot reach the fonts
 * of the page. The rules are injected through the DOM in a style element inside a defs block.
 *
 * @param svg - Standalone SVG markup, as produced by renderSvg
 * @param elements - Elements drawn in the SVG, read for their fonts and characters
 * @returns The SVG markup with the fonts, unchanged when no web font is needed
 */
export async function embedFonts(svg: string, elements: WispenElement[]): Promise<string> {
    const css = await fontFaceCss(elements);
    if (!css) return svg;

    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (root.namespaceURI !== SVG_NS || doc.getElementsByTagName("parsererror").length > 0) {
        return svg;
    }
    const defs = doc.createElementNS(SVG_NS, "defs");
    const sheet = doc.createElementNS(SVG_NS, "style");
    sheet.setAttribute("type", "text/css");
    sheet.appendChild(doc.createCDATASection(css));
    defs.appendChild(sheet);
    root.insertBefore(defs, root.firstChild);
    return new XMLSerializer().serializeToString(doc);
}
