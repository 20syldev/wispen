import { finalizeElement } from "@/lib/canvas/elements";
import { boundsCenter, distance, extendPoint, rectOutline } from "@/lib/canvas/geometry";
import { absolutePoints } from "@/lib/canvas/routing";
import { getShape } from "@/lib/registry";
import type { Binding, Point, Side, WispenElement } from "@/types/scene";

// Space left between an arrow tip and the outline it points to, in scene pixels.
export const BINDING_GAP = 6;

// Distance under which a dropped endpoint snaps to the middle of a side, in screen pixels.
const SIDE_SNAP = 14;

/**
 * Returns the point of an element outline in the direction of a target, using the shape's own
 * outline function when it has one.
 *
 * @param element - Bindable element
 * @param toward - Scene point giving the direction from the element center
 * @returns The point where the ray from the center toward the target crosses the outline
 */
export function outlinePoint(element: WispenElement, toward: Point): Point {
    const shape = getShape(element.type);
    return shape.outline ? shape.outline(element, toward) : rectOutline(element, toward);
}

/**
 * Computes where a bound endpoint sits: on a fixed anchor of the target, or on its outline
 * facing the other end of the line, kept slightly off the outline.
 *
 * @param target - Element the endpoint is attached to
 * @param binding - Binding of the endpoint, read for its fixed anchor (null follows the outline)
 * @param other - Position the endpoint faces, used to orient outline bindings
 * @param elbow - Elbow connectors attach to the middle of the side facing the other end, chosen
 * on the dominant axis; that side is returned so the router leaves it
 * @returns The endpoint position in scene coordinates, and the side for elbow outline bindings
 */
function boundPoint(
    target: WispenElement,
    binding: Binding,
    other: Point,
    elbow: boolean,
): { point: Point; side?: Side } {
    if (binding.anchor) {
        const anchor = {
            x: target.x + binding.anchor.x * target.width,
            y: target.y + binding.anchor.y * target.height,
        };
        return { point: extendPoint(boundsCenter(target), anchor, BINDING_GAP) };
    }

    const center = boundsCenter(target);
    if (elbow) {
        const dx = other.x - center.x;
        const dy = other.y - center.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
            const sign = dx < 0 ? -1 : 1;
            return {
                point: { x: center.x + sign * (target.width / 2 + BINDING_GAP), y: center.y },
                side: sign > 0 ? "e" : "w",
            };
        }
        const sign = dy < 0 ? -1 : 1;
        return {
            point: { x: center.x, y: center.y + sign * (target.height / 2 + BINDING_GAP) },
            side: sign > 0 ? "s" : "n",
        };
    }
    return { point: extendPoint(center, outlinePoint(target, other), BINDING_GAP) };
}

/**
 * Returns a binding carrying a given derived side, reusing the binding when it already does.
 *
 * @param binding - Current binding of the endpoint
 * @param side - Side chosen for an elbow outline binding, or undefined to drop a recorded side
 * @returns The same binding when unchanged, otherwise an updated copy
 */
function withSide(binding: Binding, side: Side | undefined): Binding {
    if (binding.side === side) return binding;
    return side ? { ...binding, side } : { elementId: binding.elementId, anchor: binding.anchor };
}

/**
 * Recomputes the bound endpoints of one linear element against the current targets, dropping
 * bindings whose target no longer exists.
 *
 * @param element - Line or arrow
 * @param byId - Page elements by id
 * @returns The element, updated only when an endpoint moved or a binding was dropped
 */
function refreshLinear(element: WispenElement, byId: Map<string, WispenElement>): WispenElement {
    const points = absolutePoints(element);
    if (points.length < 2) return element;

    const target = (binding: Binding | null | undefined) =>
        binding && binding.elementId !== element.id ? byId.get(binding.elementId) : undefined;
    const startTarget = target(element.startBinding);
    const endTarget = target(element.endBinding);
    const startBinding = startTarget ? (element.startBinding ?? null) : null;
    const endBinding = endTarget ? (element.endBinding ?? null) : null;
    const elbow = element.routing === "elbow";
    const last = points.length - 1;
    const facing = elbow || last === 1;

    // Anchored ends are placed first so an outline end facing one aims at its new position.
    const fixedStart =
        startTarget && startBinding?.anchor
            ? boundPoint(startTarget, startBinding, points[0], elbow)
            : null;
    const fixedEnd =
        endTarget && endBinding?.anchor
            ? boundPoint(endTarget, endBinding, points[last], elbow)
            : null;

    // With two outline bindings, aim at the other center so the ends do not chase each other.
    const startAim =
        endTarget && endBinding && !endBinding.anchor
            ? boundsCenter(endTarget)
            : facing && fixedEnd
              ? fixedEnd.point
              : points[elbow ? last : 1];
    const endAim =
        startTarget && startBinding && !startBinding.anchor
            ? boundsCenter(startTarget)
            : facing && fixedStart
              ? fixedStart.point
              : points[elbow ? 0 : last - 1];

    const start =
        startTarget && startBinding
            ? (fixedStart ?? boundPoint(startTarget, startBinding, startAim, elbow))
            : null;
    const end =
        endTarget && endBinding
            ? (fixedEnd ?? boundPoint(endTarget, endBinding, endAim, elbow))
            : null;

    const next = [...points];
    if (start) next[0] = start.point;
    if (end) next[last] = end.point;
    const nextStartBinding = startBinding && start ? withSide(startBinding, start.side) : null;
    const nextEndBinding = endBinding && end ? withSide(endBinding, end.side) : null;

    const unchanged =
        distance(next[0], points[0]) < 0.01 &&
        distance(next[last], points[last]) < 0.01 &&
        nextStartBinding === (element.startBinding ?? null) &&
        nextEndBinding === (element.endBinding ?? null);
    if (unchanged) return element;

    return finalizeElement({
        ...element,
        startBinding: nextStartBinding,
        endBinding: nextEndBinding,
        points: next.map((p) => ({ x: p.x - element.x, y: p.y - element.y })),
    });
}

/**
 * Keeps arrows glued to the shapes they are bound to after any change of the page.
 *
 * @param elements - Page elements after the change
 * @param changed - Ids of the elements that changed, or undefined to refresh every binding
 * @returns The page elements, with the same array when no arrow needed an update
 */
export function refreshBindings(elements: WispenElement[], changed?: Set<string>): WispenElement[] {
    const linear = elements.filter((el) => el.startBinding || el.endBinding);
    if (linear.length === 0) return elements;

    const byId = new Map(elements.map((el) => [el.id, el]));
    let touched = false;
    const result = elements.map((el) => {
        if (!el.startBinding && !el.endBinding) return el;
        const concerned =
            !changed ||
            changed.has(el.id) ||
            (el.startBinding &&
                (changed.has(el.startBinding.elementId) || !byId.has(el.startBinding.elementId))) ||
            (el.endBinding &&
                (changed.has(el.endBinding.elementId) || !byId.has(el.endBinding.elementId)));
        if (!concerned) return el;
        const next = refreshLinear(el, byId);
        if (next !== el) touched = true;
        return next;
    });
    return touched ? result : elements;
}

/**
 * Decides how an endpoint dropped on a shape attaches to it: to the middle of a side when the
 * point is close to one, otherwise to the outline facing the other end.
 *
 * @param target - Shape under the endpoint
 * @param point - Dropped position in scene coordinates
 * @param zoom - Current zoom, so the snapping distance stays constant on screen
 * @returns The binding to store on the endpoint
 */
export function createBinding(target: WispenElement, point: Point, zoom: number): Binding {
    const sides = [
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
    ];
    const threshold = SIDE_SNAP / zoom;
    for (const anchor of sides) {
        const p = { x: target.x + anchor.x * target.width, y: target.y + anchor.y * target.height };
        if (distance(p, point) <= threshold) return { elementId: target.id, anchor };
    }
    return { elementId: target.id, anchor: null };
}

/**
 * Lists the side midpoints of a shape, shown as connection points while dragging an arrow end.
 *
 * @param target - Bindable shape
 * @returns The four side midpoints in scene coordinates
 */
export function connectionPoints(target: WispenElement): Point[] {
    return [
        { x: target.x + target.width / 2, y: target.y },
        { x: target.x + target.width, y: target.y + target.height / 2 },
        { x: target.x + target.width / 2, y: target.y + target.height },
        { x: target.x, y: target.y + target.height / 2 },
    ];
}
