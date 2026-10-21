import { finalizeElement } from "@/lib/canvas/elements";
import { getTranslator } from "@/lib/i18n";
import { createId } from "@/lib/id";
import { DEFAULT_STYLE } from "@/lib/stores/editor";
import type { Binding, Page, Side, WispenDocument, WispenElement, WispenFile } from "@/types/scene";

// Sides an elbow connector may record on an outline binding.
const SIDES: readonly Side[] = ["n", "e", "s", "w"];

export const FILE_EXTENSION = "wispen";

export const FILE_MIME = "application/vnd.wispen+json";

/**
 * Tells whether a value is a plain object.
 *
 * @param value - Anything parsed from JSON
 * @returns true for non-null, non-array objects
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a finite number, falling back when the value is missing or invalid.
 *
 * @param value - Field read from parsed JSON, of any type
 * @param fallback - Returned when the value is not a finite number (missing, NaN, Infinity or
 *     another type)
 * @returns A finite number
 */
function num(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Reads an endpoint binding, dropping malformed ones and bindings of an element to itself.
 *
 * @param value - Field read from parsed JSON, of any type
 * @param ownerId - Id of the line holding the binding
 * @returns A valid binding, or null
 */
function normalizeBinding(value: unknown, ownerId: string): Binding | null {
    if (!isRecord(value) || typeof value.elementId !== "string" || value.elementId === ownerId) {
        return null;
    }
    const anchor = value.anchor;
    if (
        anchor !== null &&
        anchor !== undefined &&
        !(isRecord(anchor) && Number.isFinite(anchor.x) && Number.isFinite(anchor.y))
    ) {
        return null;
    }
    const binding: Binding = {
        elementId: value.elementId,
        anchor: isRecord(anchor) ? { x: anchor.x as number, y: anchor.y as number } : null,
    };
    const side = SIDES.find((candidate) => candidate === value.side);
    return side && !binding.anchor ? { ...binding, side } : binding;
}

/**
 * Repairs an element read from storage, a file or the clipboard: missing style fields take the
 * defaults, invalid geometry, points and bindings are reset, and derived sizes are recomputed.
 *
 * @param raw - Parsed JSON of any shape; fields it does not know are kept on the element
 * @returns The element, or null when it lacks an id or a type
 */
export function normalizeElement(raw: unknown): WispenElement | null {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.type !== "string") return null;
    const { points, startBinding, endBinding, ...fields } = raw;
    const element = {
        ...DEFAULT_STYLE,
        ...fields,
        x: num(raw.x, 0),
        y: num(raw.y, 0),
        width: Math.max(0, num(raw.width, 0)),
        height: Math.max(0, num(raw.height, 0)),
        opacity: Math.max(0, Math.min(100, num(raw.opacity, 100))),
        strokeWidth: Math.max(0, num(raw.strokeWidth, DEFAULT_STYLE.strokeWidth)),
        fontSize: Math.max(1, num(raw.fontSize, DEFAULT_STYLE.fontSize)),
        radius: Math.max(0, num(raw.radius, DEFAULT_STYLE.radius)),
        text: typeof raw.text === "string" ? raw.text : "",
    } as WispenElement;
    if (Array.isArray(points)) {
        element.points = points.filter(isRecord).map((p) => ({ x: num(p.x, 0), y: num(p.y, 0) }));
    }
    if (startBinding !== undefined) element.startBinding = normalizeBinding(startBinding, raw.id);
    if (endBinding !== undefined) element.endBinding = normalizeBinding(endBinding, raw.id);
    return finalizeElement(element);
}

/**
 * Repairs a page, dropping unreadable elements and duplicate ids.
 *
 * @param raw - Parsed JSON of any shape; anything but an object is treated as an empty page
 * @param index - Position of the page, used to name unnamed pages
 * @returns The page, with a fresh id and a numbered name when they are missing
 */
function normalizePage(raw: unknown, index: number): Page {
    const page = isRecord(raw) ? raw : {};
    const seen = new Set<string>();
    const elements = (Array.isArray(page.elements) ? page.elements : [])
        .map(normalizeElement)
        .filter((el): el is WispenElement => {
            if (!el || seen.has(el.id)) return false;
            seen.add(el.id);
            return true;
        });
    return {
        id: typeof page.id === "string" ? page.id : createId(),
        name:
            typeof page.name === "string" && page.name.trim()
                ? page.name
                : getTranslator("common")("pageName", { number: index + 1 }),
        elements,
    };
}

/**
 * Validates and repairs a document read from storage or a file, so a hand-edited or older
 * file opens instead of crashing the editor.
 *
 * @param raw - Parsed JSON of any shape; it must be an object holding a pages array
 * @returns The repaired document, with unique page ids and at least one page
 * @throws When the value is not a document at all
 */
export function normalizeDocument(raw: unknown): WispenDocument {
    if (!isRecord(raw) || !Array.isArray(raw.pages)) throw new Error("Not a wispen document");
    const seen = new Set<string>();
    const pages = raw.pages.map((value: unknown, index: number) => {
        const page = normalizePage(value, index);
        const id = seen.has(page.id) ? createId() : page.id;
        seen.add(id);
        return id === page.id ? page : { ...page, id };
    });
    if (pages.length === 0) pages.push(normalizePage({}, 0));
    const now = Date.now();
    return {
        id: typeof raw.id === "string" ? raw.id : createId(),
        name:
            typeof raw.name === "string" && raw.name.trim()
                ? raw.name
                : getTranslator("common")("untitled"),
        createdAt: num(raw.createdAt, now),
        updatedAt: num(raw.updatedAt, now),
        pages,
        activePageId:
            typeof raw.activePageId === "string" && pages.some((p) => p.id === raw.activePageId)
                ? raw.activePageId
                : pages[0].id,
    };
}

/**
 * Serializes a document in the .wispen file format.
 *
 * @param document - Wrapped in the { type, version } envelope that isWispenFile detects
 * @returns Indented JSON, friendly to version control
 */
export function serializeDocument(document: WispenDocument): string {
    const file: WispenFile = { type: "wispen", version: 1, document };
    return JSON.stringify(file, null, 2);
}

/**
 * Tells whether text looks like a .wispen file, without fully parsing it.
 *
 * @param text - File content; only its first 200 characters are inspected
 * @returns true when the content carries the wispen envelope
 */
export function isWispenFile(text: string): boolean {
    return /^\s*\{[\s\S]*"type"\s*:\s*"wispen"/.test(text.slice(0, 200));
}

/**
 * Parses a .wispen file.
 *
 * @param text - JSON text of the file, envelope included
 * @returns The repaired document
 * @throws When the content is not valid JSON or not a wispen file
 */
export function parseDocumentFile(text: string): WispenDocument {
    const data = JSON.parse(text) as Partial<WispenFile>;
    if (!isRecord(data) || data.type !== "wispen") throw new Error("Not a wispen file");
    return normalizeDocument(data.document);
}
