import { canvasBackground, exportContext } from "@/lib/canvas/colors";
import { pointsBounds } from "@/lib/canvas/geometry";
import { labelArea } from "@/lib/canvas/render";
import { absolutePoints, computeRoute, polylineMidpoint } from "@/lib/canvas/routing";
import { LINE_HEIGHT } from "@/lib/canvas/text";
import { createId } from "@/lib/id";
import { getShape, hasShape } from "@/lib/registry";
import type { ExportInput, RenderContext } from "@/types/plugin";
import type { Binding, Bounds, Point, WispenElement } from "@/types/scene";

import { exportArrowhead, exportColor, exportFont, loadStandIns, measureText } from "./mapping";
import type {
    ExcalidrawBinding,
    ExcalidrawElement,
    ExcalidrawFile,
    ExcalidrawScene,
} from "./types";

export const EXCALIDRAW_MIME = "application/vnd.excalidraw+json";

// Box types excalidraw knows under the same name; other box shapes become rectangles.
const NATIVE_BOXES = new Set(["rectangle", "ellipse", "diamond"]);

// Gap excalidraw keeps between a bound arrow tip and its target, close to the editor one.
const BINDING_GAP = 6;

// Widest label of a line or arrow before it wraps, as drawn by the editor.
const LINE_LABEL_WIDTH = 240;

interface ExportState {
    ctx: RenderContext;
    targets: Map<string, WispenElement>;
    files: Record<string, ExcalidrawFile>;
    fileIds: Map<string, string>;
}

/**
 * Returns a random 31-bit integer, the format of excalidraw seeds and nonces.
 *
 * @returns A non-negative integer
 */
function randomInt(): number {
    return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Builds an excalidraw element with neutral defaults: no fill, sharp corners, no roughness so
 * shapes keep the clean look of the editor.
 *
 * @param id - Id of the excalidraw element, the source element id so bindings stay valid
 * @param type - Native excalidraw type string, such as rectangle, text, arrow or freedraw
 * @param bounds - Position and size in scene pixels
 * @param patch - Properties overriding the defaults
 * @returns The excalidraw element
 */
function shell(
    id: string,
    type: string,
    bounds: Bounds,
    patch: Partial<ExcalidrawElement>,
): ExcalidrawElement {
    return {
        id,
        type,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        angle: 0,
        strokeColor: "#1e1e1e",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: null,
        seed: randomInt(),
        version: 1,
        versionNonce: randomInt(),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        ...patch,
    };
}

/**
 * Returns the stroke, opacity, group and lock properties shared by every exported element.
 *
 * @param element - Element read for its stroke, opacity, group and lock
 * @param state - Export state whose render context resolves the stroke color
 * @returns The strokeColor, strokeWidth, strokeStyle, opacity, groupIds and locked properties
 */
function common(element: WispenElement, state: ExportState): Partial<ExcalidrawElement> {
    return {
        strokeColor: exportColor(state.ctx, element.strokeColor, "stroke"),
        strokeWidth: element.strokeWidth,
        strokeStyle: element.strokeStyle,
        opacity: element.opacity,
        groupIds: element.groupId ? [element.groupId] : [],
        locked: element.locked === true,
    };
}

/**
 * Builds the excalidraw text element holding the label of a container, positioned inside the
 * label area the way the editor draws it.
 *
 * @param element - Container read for its text and font properties
 * @param container - Exported container, which gets the text listed in its bound elements; a
 * container excalidraw cannot bind text to (a plain line) gets a free text element instead
 * @param area - Area the label wraps into, in scene coordinates
 * @param state - Export state holding the render context
 * @returns The text element
 */
function boundText(
    element: WispenElement,
    container: ExcalidrawElement,
    area: Bounds,
    state: ExportState,
): ExcalidrawElement {
    const family = exportFont(element.fontFamily);
    const layout = measureText(element, family, Math.max(area.width, 1));
    const width = layout.width;
    const x =
        element.textAlign === "left"
            ? area.x
            : element.textAlign === "right"
              ? area.x + area.width - width
              : area.x + (area.width - width) / 2;
    const y =
        element.verticalAlign === "top"
            ? area.y
            : element.verticalAlign === "bottom"
              ? area.y + area.height - layout.height
              : area.y + (area.height - layout.height) / 2;
    const id = createId();
    const bindable = container.type !== "line";
    if (bindable) {
        container.boundElements = [...(container.boundElements ?? []), { id, type: "text" }];
    }
    return shell(
        id,
        "text",
        { x, y, width, height: layout.height },
        {
            strokeColor: exportColor(state.ctx, element.textColor, "stroke"),
            opacity: element.opacity,
            groupIds: container.groupIds,
            locked: container.locked,
            text: layout.lines.join("\n"),
            originalText: element.text,
            fontSize: element.fontSize,
            fontFamily: family,
            textAlign: element.textAlign,
            verticalAlign: element.verticalAlign,
            containerId: bindable ? container.id : null,
            autoResize: true,
            lineHeight: LINE_HEIGHT,
        },
    );
}

/**
 * Exports a box shape with its label. Shapes excalidraw does not know (sticky notes, plugin
 * shapes, unknown types) become rectangles carrying the same colors and label.
 *
 * @param element - Box element of any registered or unknown type
 * @param state - Export state resolving the colors
 * @returns The shape, followed by its bound text when it has a label
 */
function exportBox(element: WispenElement, state: ExportState): ExcalidrawElement[] {
    const shape = getShape(element.type);
    const registered = hasShape(element.type);
    const filled = registered ? shape.fill === true : true;
    const rounded = (registered ? shape.radius === true : true) && element.radius > 0;
    const box = shell(
        element.id,
        NATIVE_BOXES.has(element.type) ? element.type : "rectangle",
        element,
        {
            ...common(element, state),
            backgroundColor: filled
                ? exportColor(state.ctx, element.fillColor, "fill")
                : "transparent",
            roundness: rounded ? { type: 3, value: element.radius } : null,
        },
    );
    if (!element.text) return [box];
    const area = shape.textBounds?.(element) ?? labelArea(element);
    return [box, boundText(element, box, area, state)];
}

/**
 * Exports a free text block, widened when the excalidraw font is wider than the editor one
 * while keeping the text anchored on the side it is aligned to.
 *
 * @param element - Text element, wrapped to its width only when autoSize is false
 * @param state - Export state resolving the colors
 * @returns The excalidraw text element
 */
function exportText(element: WispenElement, state: ExportState): ExcalidrawElement {
    const wrap = element.autoSize === false;
    const family = exportFont(element.fontFamily);
    const layout = measureText(element, family, wrap ? Math.max(element.width, 1) : Infinity);
    const width = wrap ? Math.max(element.width, layout.width) : layout.width;
    const shift =
        element.textAlign === "left"
            ? 0
            : element.textAlign === "right"
              ? element.width - width
              : (element.width - width) / 2;
    const bounds = { x: element.x + shift, y: element.y, width, height: layout.height };
    return shell(element.id, "text", bounds, {
        ...common(element, state),
        strokeColor: exportColor(state.ctx, element.textColor, "stroke"),
        text: layout.lines.join("\n"),
        originalText: element.text,
        fontSize: element.fontSize,
        fontFamily: family,
        textAlign: element.textAlign,
        verticalAlign: "top",
        containerId: null,
        autoResize: !wrap,
        lineHeight: LINE_HEIGHT,
    });
}

/**
 * Exports a picture, storing its data URL once in the files map.
 *
 * @param element - Image element read for its data URL source
 * @param state - Export state, whose files map is completed
 * @returns The excalidraw image element, or null when the picture has no source
 */
function exportImage(element: WispenElement, state: ExportState): ExcalidrawElement | null {
    if (!element.src) return null;
    let fileId = state.fileIds.get(element.src);
    if (!fileId) {
        fileId = createId();
        const now = Date.now();
        state.fileIds.set(element.src, fileId);
        state.files[fileId] = {
            mimeType: /^data:([^;,]+)/.exec(element.src)?.[1] ?? "image/png",
            id: fileId,
            dataURL: element.src,
            created: now,
            lastRetrieved: now,
        };
    }
    return shell(element.id, "image", element, {
        ...common(element, state),
        strokeColor: "transparent",
        roundness: element.radius > 0 ? { type: 3, value: element.radius } : null,
        fileId,
        status: "saved",
        scale: [1, 1],
        crop: null,
    });
}

/**
 * Returns the points excalidraw should draw a line through: the computed path of elbow
 * connectors, a few samples of two-point curves (excalidraw draws them straight otherwise),
 * and the vertices for everything else.
 *
 * @param element - Line or arrow
 * @returns Absolute points, at least two
 */
function linearPoints(element: WispenElement): Point[] {
    const route = computeRoute(element);
    if (element.routing === "elbow") return route.samples;
    const points = absolutePoints(element);
    if (element.routing === "curved" && points.length === 2) {
        const last = route.samples.length - 1;
        return [0, 0.25, 0.5, 0.75, 1].map((t) => route.samples[Math.round(t * last)]);
    }
    return points;
}

/**
 * Converts the binding of an arrow end, kept only when the target is exported too.
 *
 * @param binding - Binding of the arrow end, null or undefined when the end is free; its element
 * id is looked up among the exported targets
 * @param end - Position of the end in scene coordinates
 * @param fixed - Writes the attachment point, required by elbow arrows
 * @param state - Export state listing the exported targets
 * @returns The excalidraw binding, or null
 */
function exportBinding(
    binding: Binding | null | undefined,
    end: Point,
    fixed: boolean,
    state: ExportState,
): ExcalidrawBinding | null {
    const target = binding ? state.targets.get(binding.elementId) : undefined;
    if (!binding || !target) return null;
    const ratio = (value: number, size: number) => (size > 0 ? value / size : 0.5);
    const point: [number, number] = binding.anchor
        ? [binding.anchor.x, binding.anchor.y]
        : [ratio(end.x - target.x, target.width), ratio(end.y - target.y, target.height)];
    return {
        elementId: target.id,
        focus: 0,
        gap: BINDING_GAP,
        ...(fixed || binding.anchor ? { fixedPoint: point } : {}),
    };
}

/**
 * Exports a line or an arrow with its label. Lines carrying an arrowhead become arrows, the
 * only linear type excalidraw draws arrowheads and bindings for.
 *
 * @param element - Line or arrow, with its routing, arrowheads and bindings
 * @param state - Export state resolving the colors and listing the binding targets
 * @returns The arrow or line, followed by its bound text when it has a label
 */
function exportLinear(element: WispenElement, state: ExportState): ExcalidrawElement[] {
    const points = linearPoints(element);
    if (points.length < 2) return [];
    const origin = points[0];
    const end = points[points.length - 1];
    const bounds = pointsBounds(points);
    const heads =
        (element.startArrowhead ?? "none") !== "none" ||
        (element.endArrowhead ?? "none") !== "none";
    const arrow = element.type === "arrow" || heads;
    const elbow = arrow && element.routing === "elbow";

    const linear = shell(
        element.id,
        arrow ? "arrow" : "line",
        { x: origin.x, y: origin.y, width: bounds.width, height: bounds.height },
        {
            ...common(element, state),
            roundness: element.routing === "curved" ? { type: 2 } : null,
            points: points.map((p) => [p.x - origin.x, p.y - origin.y]),
            lastCommittedPoint: null,
            startBinding: arrow ? exportBinding(element.startBinding, origin, elbow, state) : null,
            endBinding: arrow ? exportBinding(element.endBinding, end, elbow, state) : null,
            startArrowhead: arrow ? exportArrowhead(element.startArrowhead) : null,
            endArrowhead: arrow ? exportArrowhead(element.endArrowhead) : null,
            ...(arrow ? { elbowed: elbow } : {}),
        },
    );
    if (!element.text) return [linear];

    const middle = polylineMidpoint(computeRoute(element).samples);
    const area = {
        x: middle.x - LINE_LABEL_WIDTH / 2,
        y: middle.y,
        width: LINE_LABEL_WIDTH,
        height: 0,
    };
    const label = { ...element, textAlign: "center" as const, verticalAlign: "middle" as const };
    return [linear, boundText(label, linear, area, state)];
}

/**
 * Exports a freehand stroke.
 *
 * @param element - Freehand stroke read for its points relative to (x, y)
 * @param state - Export state resolving the colors
 * @returns The excalidraw freedraw element, or null without points
 */
function exportFreedraw(element: WispenElement, state: ExportState): ExcalidrawElement | null {
    const points = absolutePoints(element);
    if (points.length === 0) return null;
    const origin = points[0];
    const bounds = pointsBounds(points);
    return shell(
        element.id,
        "freedraw",
        { x: origin.x, y: origin.y, width: bounds.width, height: bounds.height },
        {
            ...common(element, state),
            points: points.map((p) => [p.x - origin.x, p.y - origin.y]),
            pressures: [],
            simulatePressure: true,
            lastCommittedPoint: null,
        },
    );
}

/**
 * Exports one element according to its kind.
 *
 * @param element - Element to export; its type, then its shape kind, picks the exporter
 * @param state - Export state shared by every element, whose files map is completed
 * @returns The excalidraw elements, empty when the element cannot be exported
 */
function exportElement(element: WispenElement, state: ExportState): ExcalidrawElement[] {
    if (element.type === "text") return [exportText(element, state)];
    if (element.type === "image") return [exportImage(element, state)].filter((el) => el !== null);
    const kind = getShape(element.type).kind;
    if (kind === "linear") return exportLinear(element, state);
    if (kind === "freedraw") return [exportFreedraw(element, state)].filter((el) => el !== null);
    return exportBox(element, state);
}

/**
 * Lists every arrow bound to a shape in the bound elements of that shape, which excalidraw
 * reads to move arrows along with shapes.
 *
 * @param elements - Exported excalidraw elements, modified in place
 */
function linkArrows(elements: ExcalidrawElement[]): void {
    const byId = new Map(elements.map((el) => [el.id, el]));
    for (const el of elements) {
        for (const binding of [el.startBinding, el.endBinding]) {
            const target = binding ? byId.get(binding.elementId) : undefined;
            if (!target || target.boundElements?.some((bound) => bound.id === el.id)) continue;
            target.boundElements = [...(target.boundElements ?? []), { id: el.id, type: "arrow" }];
        }
    }
}

/**
 * Converts elements to an excalidraw scene with colors resolved for the light theme.
 *
 * @param elements - Elements to export, bottom to top
 * @returns The scene, ready to serialize
 */
export function buildScene(elements: WispenElement[]): ExcalidrawScene {
    const state: ExportState = {
        ctx: exportContext("light"),
        targets: new Map(elements.map((el) => [el.id, el])),
        files: {},
        fileIds: new Map(),
    };

    const out = elements.flatMap((element) => exportElement(element, state));
    linkArrows(out);

    return {
        type: "excalidraw",
        version: 2,
        source: "wispen",
        elements: out,
        appState: {
            viewBackgroundColor: canvasBackground("light"),
            gridSize: 20,
            gridStep: 5,
            gridModeEnabled: false,
        },
        files: state.files,
    };
}

/**
 * Exports the active page or the selection as a .excalidraw file.
 *
 * @param input - Export input; only the first page is used since the scopes produce one page
 * @returns The indented JSON of the scene, typed with EXCALIDRAW_MIME
 */
export async function exportExcalidraw(input: ExportInput): Promise<Blob> {
    const elements = input.pages[0]?.elements ?? [];
    await loadStandIns(elements);
    const scene = buildScene(elements);
    return new Blob([JSON.stringify(scene, null, 2)], { type: EXCALIDRAW_MIME });
}
