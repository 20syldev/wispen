import { elementBounds } from "@/lib/canvas/elements";
import { distance, unionBounds } from "@/lib/canvas/geometry";
import { absolutePoints, segmentMidpoints } from "@/lib/canvas/routing";
import { getShape } from "@/lib/registry";
import type { CursorName } from "@/lib/stores/editor";
import type { Bounds, Point, WispenElement } from "@/types/scene";

export type ResizeHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type Handle =
    | { kind: "resize"; id: ResizeHandleId; point: Point }
    | { kind: "vertex"; index: number; point: Point }
    | { kind: "midpoint"; index: number; point: Point };

// Handle hit radius, in screen pixels.
export const HANDLE_RADIUS = 9;

// Distance between the selection outline and the selected elements, in screen pixels.
export const SELECTION_PADDING = 6;

export const RESIZE_CURSORS: Record<ResizeHandleId, CursorName> = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
};

/**
 * Returns the bounds enclosing a selection.
 *
 * @param elements - Elements of the selection, in any order, possibly empty
 * @returns The union of their bounds, or null for an empty selection
 */
export function selectionBounds(elements: WispenElement[]): Bounds | null {
    return unionBounds(elements.map(elementBounds));
}

/**
 * Returns the line or arrow that makes up a selection on its own, edited through its points
 * rather than a bounding box.
 *
 * @param elements - Elements of the selection; only a list of exactly one element can match
 * @returns The linear element when it is the only one selected, null otherwise
 */
export function singleLinear(elements: WispenElement[]): WispenElement | null {
    return elements.length === 1 && getShape(elements[0].type).kind === "linear"
        ? elements[0]
        : null;
}

/**
 * Lists the interactive handles of a selection: point handles for a single line (only its ends
 * for elbow connectors, whose router ignores inner points; bend handles sit on the drawn curve),
 * otherwise resize handles around the selection bounds, skipping those that make no sense for
 * the shape (vertical handles of a text block, side handles of a picture).
 *
 * @param elements - Selected elements, locked ones excluded by the caller
 * @param zoom - Current zoom, so the handles keep a constant screen size
 * @returns Handles in scene coordinates
 */
export function getHandles(elements: WispenElement[], zoom: number): Handle[] {
    if (elements.length === 0) return [];

    const linear = singleLinear(elements);
    if (linear) {
        const points = absolutePoints(linear);
        const handles: Handle[] = points.map((point, index) => ({ kind: "vertex", index, point }));
        if (linear.routing === "elbow") {
            return handles.filter((_, index) => index === 0 || index === points.length - 1);
        }
        segmentMidpoints(linear).forEach((point, i) => {
            if (distance(points[i], points[i + 1]) * zoom < HANDLE_RADIUS * 4) return;
            handles.push({ kind: "midpoint", index: i, point });
        });
        return handles;
    }

    const bounds = selectionBounds(elements);
    if (!bounds) return [];
    const pad = SELECTION_PADDING / zoom;
    const x0 = bounds.x - pad;
    const y0 = bounds.y - pad;
    const x1 = bounds.x + bounds.width + pad;
    const y1 = bounds.y + bounds.height + pad;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    const all: { id: ResizeHandleId; point: Point }[] = [
        { id: "nw", point: { x: x0, y: y0 } },
        { id: "n", point: { x: cx, y: y0 } },
        { id: "ne", point: { x: x1, y: y0 } },
        { id: "e", point: { x: x1, y: cy } },
        { id: "se", point: { x: x1, y: y1 } },
        { id: "s", point: { x: cx, y: y1 } },
        { id: "sw", point: { x: x0, y: y1 } },
        { id: "w", point: { x: x0, y: cy } },
    ];

    const single = elements.length === 1 ? getShape(elements[0].type) : null;
    const small = (x1 - x0) * zoom < HANDLE_RADIUS * 5 || (y1 - y0) * zoom < HANDLE_RADIUS * 5;
    const allowed = all.filter(({ id }) => {
        const side = id.length === 1;
        if (single?.text === "content") return id !== "n" && id !== "s";
        if (single?.keepAspectRatio) return !side;
        return !(side && small);
    });
    return allowed.map((handle) => ({ kind: "resize", ...handle }));
}

/**
 * Finds the handle under a scene point.
 *
 * @param handles - Handles of the current selection, in scene coordinates; on equal distance the
 * last one wins
 * @param point - Scene position of the pointer
 * @param zoom - Current zoom, converting the screen hit radius to scene pixels
 * @returns The closest handle within reach, or null
 */
export function handleAt(handles: Handle[], point: Point, zoom: number): Handle | null {
    let best: Handle | null = null;
    let bestDistance = HANDLE_RADIUS / zoom;
    for (const handle of handles) {
        const d = distance(handle.point, point);
        if (d <= bestDistance) {
            best = handle;
            bestDistance = d;
        }
    }
    return best;
}
