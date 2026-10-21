import { getTranslator } from "@/lib/i18n";
import { createId } from "@/lib/id";
import { getShape } from "@/lib/registry";
import { normalizeDocument } from "@/lib/storage/serialization";
import { DEFAULT_STYLE } from "@/lib/stores/editor";
import type { Binding, Point, WispenDocument, WispenElement } from "@/types/scene";

import { importArrowhead, importColor, importFont, importStrokeStyle } from "./mapping";

type Raw = Record<string, unknown>;

// Corner radius given to excalidraw shapes with rounded corners.
const ROUND_RADIUS = 12;

// Excalidraw element types without an equivalent, skipped on import.
const SKIPPED = new Set(["frame", "magicframe", "selection", "embeddable", "iframe"]);

/**
 * Tells whether a value is a plain object.
 *
 * @param value - Anything parsed from JSON
 * @returns true for non-null, non-array objects
 */
function isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a finite number, falling back when the value is missing or invalid.
 *
 * @param value - Value read from the file, possibly missing, NaN or of another type
 * @param fallback - Value returned when the value is not a finite number; it is not validated
 * @returns The value itself when it is a finite number, the fallback otherwise
 */
function num(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Clamps a ratio to the 0..1 range.
 *
 * @param value - Ratio, possibly slightly outside the range (excalidraw adds the binding gap)
 * @returns The ratio bounded to 0 and 1 inclusive
 */
function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/**
 * Tells whether text is an excalidraw scene, from the envelope at the start of the file.
 *
 * @param text - File content; only its first 400 characters are read
 * @returns true when the content starts like a .excalidraw file
 */
export function isExcalidrawScene(text: string): boolean {
    return /^\s*\{[\s\S]*?"type"\s*:\s*"excalidraw"\s*[,}]/.test(text.slice(0, 400));
}

/**
 * Derives a document name from a file name.
 *
 * @param fileName - Name of the imported file, e.g. "roadmap.excalidraw"
 * @returns The name without its extension, "Excalidraw" when nothing is left
 */
export function documentName(fileName: string): string {
    return fileName.replace(/(\.excalidraw)?(\.json)?$/i, "").trim() || "Excalidraw";
}

/**
 * Reads the vertices of a linear or freehand excalidraw element.
 *
 * @param value - Array of [x, y] pairs relative to the element position
 * @returns Points relative to the element position, invalid pairs skipped
 */
function readPoints(value: unknown): Point[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((pair): pair is unknown[] => Array.isArray(pair) && pair.length >= 2)
        .map((pair) => ({ x: num(pair[0], 0), y: num(pair[1], 0) }));
}

/**
 * Tells whether an excalidraw element has rounded corners or curved segments. Files written
 * before the roundness field (excalidraw 0.14) mark them with strokeSharpness "round".
 *
 * @param raw - Excalidraw element read for roundness, or strokeSharpness in older files
 * @returns true when the element is rounded
 */
function isRounded(raw: Raw): boolean {
    return isRecord(raw.roundness) || raw.strokeSharpness === "round";
}

/**
 * Converts excalidraw corner rounding to a radius: the explicit value when the file has one
 * (files written by this app), otherwise a fixed radius for any rounded shape.
 *
 * @param raw - Excalidraw element read for roundness, or strokeSharpness in older files
 * @returns The corner radius in pixels, 0 for sharp corners
 */
function roundness(raw: Raw): number {
    if (!isRounded(raw)) return 0;
    const value = isRecord(raw.roundness) ? raw.roundness.value : undefined;
    return typeof value === "number" && value > 0 ? value : ROUND_RADIUS;
}

/**
 * Builds the properties shared by every imported element.
 * Negative sizes, written by old excalidraw versions, are flipped into positive ones.
 *
 * @param raw - Excalidraw element read for its id, geometry, colors, stroke, groups and lock
 * @param type - Shape type of the new element
 * @returns A complete element without text
 */
function baseElement(raw: Raw, type: string): WispenElement {
    const width = num(raw.width, 0);
    const height = num(raw.height, 0);
    const groupIds = Array.isArray(raw.groupIds)
        ? raw.groupIds.filter((id): id is string => typeof id === "string")
        : [];
    return {
        ...DEFAULT_STYLE,
        id: raw.id as string,
        type,
        x: num(raw.x, 0) + Math.min(0, width),
        y: num(raw.y, 0) + Math.min(0, height),
        width: Math.abs(width),
        height: Math.abs(height),
        strokeColor: importColor(raw.strokeColor, "ink"),
        fillColor: importColor(raw.backgroundColor, "transparent"),
        strokeWidth: num(raw.strokeWidth, DEFAULT_STYLE.strokeWidth),
        strokeStyle: importStrokeStyle(raw.strokeStyle),
        opacity: num(raw.opacity, 100),
        radius: roundness(raw),
        text: "",
        textColor: "ink",
        groupId: groupIds[0] ?? null,
        locked: raw.locked === true,
    };
}

/**
 * Reads the text properties of an excalidraw text element, for a text block or a label.
 *
 * @param raw - Excalidraw text element, read for originalText (or text), strokeColor, fontFamily,
 * fontSize, textAlign and verticalAlign, each with a default when missing or invalid
 * @returns The text, textColor, fontFamily, fontSize, textAlign and verticalAlign properties
 */
function textProperties(raw: Raw): Partial<WispenElement> {
    const align = raw.textAlign;
    const vertical = raw.verticalAlign;
    return {
        text: typeof raw.originalText === "string" ? raw.originalText : String(raw.text ?? ""),
        textColor: importColor(raw.strokeColor, "ink"),
        fontFamily: importFont(raw.fontFamily),
        fontSize: num(raw.fontSize, DEFAULT_STYLE.fontSize),
        textAlign: align === "left" || align === "right" ? align : "center",
        verticalAlign: vertical === "top" || vertical === "bottom" ? vertical : "middle",
    };
}

/**
 * Converts one excalidraw element; bound labels are handled separately.
 *
 * @param raw - Excalidraw element, not deleted
 * @param files - Files map of the scene, holding picture data URLs
 * @returns The element, or null for unsupported types, empty lines and missing pictures
 */
function convert(raw: Raw, files: Raw): WispenElement | null {
    switch (raw.type) {
        case "rectangle":
        case "ellipse":
        case "diamond":
            return baseElement(raw, raw.type);

        case "text":
            return {
                ...baseElement(raw, "text"),
                ...textProperties(raw),
                fillColor: "transparent",
                verticalAlign: "top",
                autoSize: raw.autoResize !== false,
            };

        case "arrow":
        case "line": {
            const points = readPoints(raw.points);
            if (points.length < 2) return null;
            const elbow = raw.elbowed === true;

            // Excalidraw draws a rounded two-point arrow straight, curved routing would bend it
            const curved = isRounded(raw) && points.length > 2;
            return {
                ...baseElement(raw, raw.type),
                x: num(raw.x, 0),
                y: num(raw.y, 0),
                fillColor: "transparent",
                points: elbow ? [points[0], points[points.length - 1]] : points,
                routing: elbow ? "elbow" : curved ? "curved" : "straight",
                startArrowhead: importArrowhead(raw.startArrowhead),
                endArrowhead: importArrowhead(raw.endArrowhead),
                startBinding: null,
                endBinding: null,
                textAlign: "center",
                verticalAlign: "middle",
            };
        }

        case "freedraw": {
            const points = readPoints(raw.points);
            if (points.length === 0) return null;
            return {
                ...baseElement(raw, "freedraw"),
                x: num(raw.x, 0),
                y: num(raw.y, 0),
                fillColor: "transparent",
                points,
            };
        }

        case "image": {
            const file = typeof raw.fileId === "string" ? files[raw.fileId] : null;
            if (!isRecord(file) || typeof file.dataURL !== "string") return null;
            return {
                ...baseElement(raw, "image"),
                strokeColor: "transparent",
                fillColor: "transparent",
                src: file.dataURL,
            };
        }

        default:
            return null;
    }
}

/**
 * Converts an excalidraw arrow binding, kept only when the target was imported and accepts
 * arrows. Bindings follow the target outline, except on elbow arrows whose fixed point
 * becomes an anchor so the connector keeps leaving and reaching the same sides.
 *
 * @param value - startBinding or endBinding of an excalidraw arrow
 * @param imported - Imported elements by id
 * @param elbow - Whether the arrow is an elbow connector
 * @returns The binding, or null
 */
function convertBinding(
    value: unknown,
    imported: Map<string, WispenElement>,
    elbow: boolean,
): Binding | null {
    if (!isRecord(value) || typeof value.elementId !== "string") return null;
    const target = imported.get(value.elementId);
    if (!target || !getShape(target.type).bindable) return null;
    const fixed = value.fixedPoint;
    const anchor =
        elbow && Array.isArray(fixed) && fixed.length === 2
            ? { x: clamp01(num(fixed[0], 0.5)), y: clamp01(num(fixed[1], 0.5)) }
            : null;
    return { elementId: target.id, anchor };
}

/**
 * Parses a .excalidraw file into a new single-page document. Deleted elements, frames and
 * embeds are skipped, bound texts become the labels of their containers, arrow bindings and
 * the first group of each element are kept. Rotations are not supported and are dropped.
 *
 * @param text - Content of the .excalidraw file, JSON with the excalidraw envelope
 * @param name - Name of the new document
 * @returns The document, repaired by the same rules as .wispen files
 * @throws When the content is not an excalidraw scene
 */
export function parseExcalidraw(text: string, name: string): WispenDocument {
    const data: unknown = JSON.parse(text);
    if (!isRecord(data) || data.type !== "excalidraw" || !Array.isArray(data.elements)) {
        throw new Error("Not an excalidraw file");
    }
    const files = isRecord(data.files) ? data.files : {};
    const raws = data.elements.filter(
        (raw): raw is Raw =>
            isRecord(raw) &&
            typeof raw.id === "string" &&
            typeof raw.type === "string" &&
            raw.isDeleted !== true &&
            !SKIPPED.has(raw.type),
    );
    const byId = new Map(raws.map((raw) => [raw.id as string, raw]));

    const elements: WispenElement[] = [];
    const imported = new Map<string, WispenElement>();
    const labels: Raw[] = [];
    for (const raw of raws) {
        if (
            raw.type === "text" &&
            typeof raw.containerId === "string" &&
            byId.has(raw.containerId)
        ) {
            labels.push(raw);
            continue;
        }
        const element = convert(raw, files);
        if (!element) continue;
        elements.push(element);
        imported.set(element.id, element);
    }

    for (const raw of labels) {
        const container = imported.get(raw.containerId as string);
        if (container && getShape(container.type).text === "label") {
            Object.assign(container, textProperties(raw));
            continue;
        }
        const standalone = convert(raw, files);
        if (standalone) elements.push(standalone);
    }

    for (const element of elements) {
        if (!element.points || element.type === "freedraw") continue;
        const raw = byId.get(element.id);
        if (!raw) continue;
        const elbow = element.routing === "elbow";
        element.startBinding = convertBinding(raw.startBinding, imported, elbow);
        element.endBinding = convertBinding(raw.endBinding, imported, elbow);
    }

    const pageName = getTranslator("common")("pageName", { number: 1 });
    return normalizeDocument({
        id: createId(),
        name,
        pages: [{ id: createId(), name: pageName, elements }],
    });
}
