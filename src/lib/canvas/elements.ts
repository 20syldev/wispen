import { TRANSPARENT } from "@/data/palette";
import {
    boundsContain,
    boundsInside,
    distanceToPolyline,
    expandBounds,
    pointsBounds,
    unionBounds,
} from "@/lib/canvas/geometry";
import { lineLabel } from "@/lib/canvas/render";
import { absolutePoints, computeRoute } from "@/lib/canvas/routing";
import { layoutText } from "@/lib/canvas/text";
import { createId } from "@/lib/id";
import { getShape } from "@/lib/registry";
import { DEFAULT_STYLE, type StyleDefaults } from "@/lib/stores/editor";
import type { ElementPatch } from "@/types/plugin";
import type { Bounds, Point, WispenElement } from "@/types/scene";

/**
 * Builds a new element of a registered type: the current style first, then the shape defaults,
 * then the explicit patch.
 *
 * @param type - Registered shape type
 * @param style - Style defaults of the editor
 * @param patch - Properties overriding everything else, typically position and size
 * @returns The element, with a fresh id and normalized geometry
 */
export function buildElement(
    type: string,
    style: StyleDefaults,
    patch: ElementPatch = {},
): WispenElement {
    const shape = getShape(type);
    const { startArrowhead, endArrowhead, routing, ...common } = style;
    const linear = shape.kind === "linear" ? { startArrowhead, endArrowhead, routing } : {};

    // A transparent stroke remembered from a box would make new lines invisible.
    const strokeColor =
        shape.kind !== "box" && common.strokeColor === TRANSPARENT
            ? DEFAULT_STYLE.strokeColor
            : common.strokeColor;
    const element: WispenElement = {
        id: createId(),
        type,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        ...common,
        strokeColor,
        ...linear,
        text: "",
        ...(shape.kind !== "box" ? { points: [] } : {}),
        ...shape.defaults,
        ...patch,
    };
    return finalizeElement(element);
}

/**
 * Restores derived geometry after an update: linear and freehand elements get bounds matching
 * their points, text blocks get the size of their content. Elbow connectors keep only their two
 * ends, the only points their router follows.
 *
 * @param element - Element after a change
 * @returns The same element when nothing changed, or an updated copy
 */
export function finalizeElement(element: WispenElement): WispenElement {
    const shape = getShape(element.type);

    if (shape.kind !== "box" && element.points && element.points.length > 0) {
        let absolute = absolutePoints(element);
        if (shape.kind === "linear" && element.routing === "elbow" && absolute.length > 2) {
            absolute = [absolute[0], absolute[absolute.length - 1]];
        }
        const bounds = pointsBounds(absolute);
        if (
            absolute.length === element.points.length &&
            bounds.x === element.x &&
            bounds.y === element.y &&
            bounds.width === element.width &&
            bounds.height === element.height
        ) {
            return element;
        }
        return {
            ...element,
            ...bounds,
            points: absolute.map((p) => ({ x: p.x - bounds.x, y: p.y - bounds.y })),
        };
    }

    if (shape.text === "content") {
        const fixed = element.autoSize === false;
        const wrapWidth = Math.max(element.width, element.fontSize);
        const layout = layoutText(element.text || " ", element, fixed ? wrapWidth : Infinity);
        const width = fixed ? wrapWidth : Math.ceil(layout.width) + 2;
        const height = Math.ceil(layout.height);
        if (width === element.width && height === element.height) return element;
        return { ...element, width, height };
    }

    return element;
}

/**
 * Returns the bounds of an element in scene coordinates.
 *
 * @param element - Any element; linear ones are kept in sync with their points
 * @returns A copy of x, y, width and height, detached from the element
 */
export function elementBounds(element: WispenElement): Bounds {
    return { x: element.x, y: element.y, width: element.width, height: element.height };
}

/**
 * Returns the area an element covers on the canvas: its bounds, or for lines and arrows their
 * drawn route and label, which leave the bounds of the points for elbow detours and curves.
 *
 * @param element - Any element
 * @returns The covered area in scene coordinates, strokes excluded
 */
export function drawnBounds(element: WispenElement): Bounds {
    if (getShape(element.type).kind !== "linear") return elementBounds(element);
    const route = computeRoute(element);
    const label = lineLabel(element, route.samples);
    return unionBounds([pointsBounds(route.samples), ...(label ? [label.bounds] : [])]) as Bounds;
}

/**
 * Tells whether a scene point touches a line or an arrow: near its drawn route, or on its label.
 *
 * @param element - Linear element
 * @param point - Scene position
 * @param tolerance - Hit margin in scene pixels
 * @returns true when the point hits the route or the label
 */
function hitLinear(element: WispenElement, point: Point, tolerance: number): boolean {
    const route = computeRoute(element);
    const label = lineLabel(element, route.samples);
    if (label && boundsContain(label.bounds, point)) return true;
    const reach = tolerance + element.strokeWidth;
    if (!boundsContain(expandBounds(pointsBounds(route.samples), reach), point)) return false;
    return distanceToPolyline(point, route.samples) <= tolerance + element.strokeWidth / 2;
}

/**
 * Tells whether a scene point touches an element.
 * Box shapes are solid (a click anywhere inside selects them), lines only near their stroke or
 * on their label.
 *
 * @param element - Element to test
 * @param point - Scene position
 * @param tolerance - Hit margin in scene pixels, typically a few screen pixels divided by the zoom
 * @returns true when the point hits the element
 */
export function hitElement(element: WispenElement, point: Point, tolerance: number): boolean {
    const shape = getShape(element.type);
    if (shape.kind === "linear" && !shape.hitTest) return hitLinear(element, point, tolerance);
    if (
        !boundsContain(expandBounds(elementBounds(element), tolerance + element.strokeWidth), point)
    ) {
        return false;
    }
    if (shape.hitTest) return shape.hitTest(element, point, tolerance);
    if (shape.kind === "freedraw") {
        return (
            distanceToPolyline(point, absolutePoints(element)) <=
            tolerance + element.strokeWidth / 2
        );
    }
    return true;
}

/**
 * Finds the topmost element under a point.
 *
 * @param elements - Page elements, bottom to top
 * @param point - Scene position
 * @param tolerance - Hit margin in scene pixels
 * @param filter - Optional predicate restricting candidates (unlocked, bindable...)
 * @returns The element, or null when the point hits nothing
 */
export function hitTest(
    elements: WispenElement[],
    point: Point,
    tolerance: number,
    filter?: (element: WispenElement) => boolean,
): WispenElement | null {
    for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i];
        if (filter && !filter(element)) continue;
        if (hitElement(element, point, tolerance)) return element;
    }
    return null;
}

/**
 * Lists the unlocked elements lying entirely inside an area, as selected by a marquee.
 *
 * @param elements - Page elements
 * @param area - Marquee bounds in scene coordinates
 * @returns Ids of the enclosed elements
 */
export function elementsInside(elements: WispenElement[], area: Bounds): string[] {
    return elements
        .filter((el) => !el.locked && boundsInside(area, drawnBounds(el)))
        .map((el) => el.id);
}

/**
 * Extends a list of ids with every member of the groups they belong to.
 *
 * @param ids - Ids to expand, such as the selection or the marquee hits
 * @param elements - Page elements
 * @returns Ids including whole groups, in page order
 */
export function expandGroups(ids: string[], elements: WispenElement[]): string[] {
    const wanted = new Set(ids);
    const groups = new Set(
        elements.filter((el) => wanted.has(el.id) && el.groupId).map((el) => el.groupId as string),
    );
    return elements
        .filter((el) => wanted.has(el.id) || (el.groupId && groups.has(el.groupId)))
        .map((el) => el.id);
}

/**
 * Copies elements with fresh ids, keeping groups and arrow bindings internal to the copied set
 * and dropping bindings to elements left behind.
 *
 * @param elements - Elements to copy
 * @param offset - Translation applied to the copies, in scene pixels
 * @returns The copies, in the same order
 */
export function cloneElements(elements: WispenElement[], offset: Point): WispenElement[] {
    const ids = new Map(elements.map((el) => [el.id, createId()]));
    const groups = new Map<string, string>();
    const remapGroup = (groupId: string | null | undefined) => {
        if (!groupId) return null;
        if (!groups.has(groupId)) groups.set(groupId, createId());
        return groups.get(groupId) as string;
    };

    return elements.map((el) => ({
        ...el,
        id: ids.get(el.id) as string,
        x: el.x + offset.x,
        y: el.y + offset.y,
        groupId: remapGroup(el.groupId),
        startBinding:
            el.startBinding && ids.has(el.startBinding.elementId)
                ? { ...el.startBinding, elementId: ids.get(el.startBinding.elementId) as string }
                : null,
        endBinding:
            el.endBinding && ids.has(el.endBinding.elementId)
                ? { ...el.endBinding, elementId: ids.get(el.endBinding.elementId) as string }
                : null,
    }));
}

/**
 * Applies a patch to an element and refreshes its derived geometry.
 *
 * @param element - Element to update
 * @param patch - Properties to change, or a function of the element returning them
 * @returns The updated copy, or the element itself when the patch changes nothing
 */
export function patchElement(
    element: WispenElement,
    patch: ElementPatch | ((element: WispenElement) => ElementPatch),
): WispenElement {
    const changes = typeof patch === "function" ? patch(element) : patch;
    const keys = Object.keys(changes) as (keyof ElementPatch)[];
    if (keys.every((key) => key in element && Object.is(element[key], changes[key]))) {
        return element;
    }
    return finalizeElement({ ...element, ...changes });
}

/**
 * Translates an element, detaching its arrow ends from shapes that do not move with it, as a
 * drag does.
 *
 * @param element - Element to move
 * @param dx - Horizontal offset in scene pixels
 * @param dy - Vertical offset in scene pixels
 * @param moving - Ids of every element moved by the same action; bindings to them are kept
 * @returns The moved copy
 */
export function moveElement(
    element: WispenElement,
    dx: number,
    dy: number,
    moving: Set<string>,
): WispenElement {
    const next = { ...element, x: element.x + dx, y: element.y + dy };
    if (element.startBinding && !moving.has(element.startBinding.elementId)) {
        next.startBinding = null;
    }
    if (element.endBinding && !moving.has(element.endBinding.elementId)) next.endBinding = null;
    return next;
}
