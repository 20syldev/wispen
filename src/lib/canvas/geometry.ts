import type { Bounds, Point, Viewport } from "@/types/scene";

/**
 * Converts a screen position (relative to the canvas) to scene coordinates.
 *
 * @param point - Position in CSS pixels from the canvas top-left corner
 * @param viewport - Current pan and zoom
 * @returns The matching scene position
 */
export function screenToScene(point: Point, viewport: Viewport): Point {
    return { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom };
}

/**
 * Converts a scene position to screen coordinates relative to the canvas.
 *
 * @param point - Position in scene pixels
 * @param viewport - Current pan and zoom
 * @returns The matching position in CSS pixels
 */
export function sceneToScreen(point: Point, viewport: Viewport): Point {
    return { x: point.x * viewport.zoom + viewport.x, y: point.y * viewport.zoom + viewport.y };
}

/**
 * Rounds a value to the nearest multiple of the grid size.
 *
 * @param value - Scene coordinate
 * @param size - Grid spacing; values below 1 disable snapping
 * @returns The snapped coordinate
 */
export function snap(value: number, size: number): number {
    return size >= 1 ? Math.round(value / size) * size : value;
}

/**
 * Snaps both coordinates of a point to the grid.
 *
 * @param point - Scene position
 * @param size - Grid spacing; values below 1 disable snapping
 * @returns The snapped position
 */
export function snapPoint(point: Point, size: number): Point {
    return { x: snap(point.x, size), y: snap(point.y, size) };
}

/**
 * Builds the normalized bounds of the rectangle spanned by two corners.
 *
 * @param a - First corner
 * @param b - Opposite corner
 * @returns Bounds with a non-negative width and height
 */
export function boundsFromPoints(a: Point, b: Point): Bounds {
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
    };
}

/**
 * Computes the smallest bounds enclosing all the given bounds.
 *
 * @param list - Bounds to merge
 * @returns The union, or null when the list is empty
 */
export function unionBounds(list: Bounds[]): Bounds | null {
    if (list.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of list) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Computes the bounding box of a list of points.
 *
 * @param points - Points to enclose, at least one
 * @returns The enclosing bounds
 */
export function pointsBounds(points: Point[]): Bounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Grows bounds by the same margin on every side.
 *
 * @param bounds - Bounds to grow
 * @param margin - Margin in the bounds unit; negative values shrink
 * @returns The expanded bounds
 */
export function expandBounds(bounds: Bounds, margin: number): Bounds {
    return {
        x: bounds.x - margin,
        y: bounds.y - margin,
        width: Math.max(0, bounds.width + margin * 2),
        height: Math.max(0, bounds.height + margin * 2),
    };
}

/**
 * Tells whether a point lies inside bounds, edges included.
 *
 * @param bounds - Area to test against
 * @param point - Position in the same coordinate space
 * @returns true when the point is inside
 */
export function boundsContain(bounds: Bounds, point: Point): boolean {
    return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
    );
}

/**
 * Tells whether two bounds overlap.
 *
 * @param a - First bounds
 * @param b - Second bounds
 * @returns true when they share at least one point
 */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
    return (
        a.x <= b.x + b.width &&
        a.x + a.width >= b.x &&
        a.y <= b.y + b.height &&
        a.y + a.height >= b.y
    );
}

/**
 * Tells whether bounds `inner` lies entirely inside bounds `outer`.
 *
 * @param outer - Containing bounds
 * @param inner - Contained bounds
 * @returns true when every edge of inner is within outer
 */
export function boundsInside(outer: Bounds, inner: Bounds): boolean {
    return (
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height
    );
}

/**
 * Returns the center of bounds.
 *
 * @param bounds - Bounds to measure
 * @returns The center point
 */
export function boundsCenter(bounds: Bounds): Point {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/**
 * Computes the Euclidean distance between two points.
 *
 * @param a - First point
 * @param b - Second point
 * @returns The distance in the points unit
 */
export function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Computes the shortest distance from a point to a segment.
 *
 * @param p - Point to measure from
 * @param a - Segment start
 * @param b - Segment end
 * @returns The distance, which is the distance to `a` for a zero-length segment
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return distance(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Computes the shortest distance from a point to an open polyline.
 *
 * @param p - Point to measure from
 * @param points - Polyline vertices, in order
 * @returns The distance, or Infinity for an empty polyline
 */
export function distanceToPolyline(p: Point, points: Point[]): number {
    if (points.length === 1) return distance(p, points[0]);
    let min = Infinity;
    for (let i = 1; i < points.length; i++) {
        min = Math.min(min, distanceToSegment(p, points[i - 1], points[i]));
    }
    return min;
}

/**
 * Tests a point against a closed polygon with the even-odd rule.
 *
 * @param p - Point to test
 * @param polygon - Polygon vertices, implicitly closed
 * @returns true when the point is inside
 */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Tests a point against the ellipse inscribed in bounds.
 *
 * @param p - Point to test
 * @param bounds - Bounds of the ellipse
 * @param tolerance - Extra margin added to both radii
 * @returns true when the point is inside the (grown) ellipse
 */
export function pointInEllipse(p: Point, bounds: Bounds, tolerance = 0): boolean {
    const rx = bounds.width / 2 + tolerance;
    const ry = bounds.height / 2 + tolerance;
    if (rx <= 0 || ry <= 0) return false;
    const c = boundsCenter(bounds);
    return ((p.x - c.x) / rx) ** 2 + ((p.y - c.y) / ry) ** 2 <= 1;
}

/**
 * Intersects the ray from the bounds center toward a point with the bounds rectangle.
 *
 * @param bounds - Rectangle to intersect
 * @param toward - Direction target; the center itself yields the center
 * @returns The point on the rectangle edge
 */
export function rectOutline(bounds: Bounds, toward: Point): Point {
    const c = boundsCenter(bounds);
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    if (dx === 0 && dy === 0) return c;
    const sx = dx === 0 ? Infinity : bounds.width / 2 / Math.abs(dx);
    const sy = dy === 0 ? Infinity : bounds.height / 2 / Math.abs(dy);
    const s = Math.min(sx, sy);
    return { x: c.x + dx * s, y: c.y + dy * s };
}

/**
 * Intersects the ray from the center of the ellipse inscribed in bounds toward a point.
 *
 * @param bounds - Bounds of the ellipse
 * @param toward - Direction target; the center itself yields the center
 * @returns The point on the ellipse
 */
export function ellipseOutline(bounds: Bounds, toward: Point): Point {
    const c = boundsCenter(bounds);
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    if ((dx === 0 && dy === 0) || rx === 0 || ry === 0) return c;
    const s = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return { x: c.x + dx * s, y: c.y + dy * s };
}

/**
 * Intersects the ray from a center toward a point with a closed convex polygon.
 *
 * @param polygon - Convex polygon vertices containing `center`
 * @param center - Origin of the ray
 * @param toward - Direction target
 * @returns The first intersection, or the center when the ray misses
 */
export function polygonOutline(polygon: Point[], center: Point, toward: Point): Point {
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    if (dx === 0 && dy === 0) return center;
    let best = Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const denominator = dx * ey - dy * ex;
        if (denominator === 0) continue;
        const t = ((a.x - center.x) * ey - (a.y - center.y) * ex) / denominator;
        const u = ((a.x - center.x) * dy - (a.y - center.y) * dx) / denominator;
        if (t >= 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return Number.isFinite(best) ? { x: center.x + dx * best, y: center.y + dy * best } : center;
}

/**
 * Moves a point a fixed distance along the direction from `from` to `to`.
 *
 * @param from - Origin of the direction
 * @param to - Point to move
 * @param amount - Distance to add; negative values pull back toward `from`
 * @returns The moved point, or `to` when both points coincide
 */
export function extendPoint(from: Point, to: Point, amount: number): Point {
    const length = distance(from, to);
    if (length === 0) return to;
    return {
        x: to.x + ((to.x - from.x) / length) * amount,
        y: to.y + ((to.y - from.y) / length) * amount,
    };
}

/**
 * Builds an SVG path through polygon vertices with rounded corners.
 * Each corner radius is clamped to half of its adjacent edges so curves never overlap.
 *
 * @param points - Vertices in order
 * @param radius - Requested corner radius in scene pixels
 * @param closed - Whether the last vertex connects back to the first
 * @returns SVG path data
 */
export function roundedPath(points: Point[], radius: number, closed: boolean): string {
    if (points.length < 2) return "";
    if (radius <= 0 || points.length < 3) {
        const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
        return closed ? `${d} Z` : d;
    }

    const count = points.length;
    const corner = (i: number) => {
        const prev = points[(i - 1 + count) % count];
        const current = points[i];
        const next = points[(i + 1) % count];
        const r = Math.min(radius, distance(prev, current) / 2, distance(current, next) / 2);
        return {
            start: extendPoint(prev, current, -r),
            end: extendPoint(next, current, -r),
            control: current,
        };
    };

    if (closed) {
        const corners = points.map((_, i) => corner(i));
        let d = `M${corners[0].end.x} ${corners[0].end.y}`;
        for (let i = 1; i <= count; i++) {
            const c = corners[i % count];
            d += ` L${c.start.x} ${c.start.y} Q${c.control.x} ${c.control.y} ${c.end.x} ${c.end.y}`;
        }
        return `${d} Z`;
    }

    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < count - 1; i++) {
        const c = corner(i);
        d += ` L${c.start.x} ${c.start.y} Q${c.control.x} ${c.control.y} ${c.end.x} ${c.end.y}`;
    }
    const last = points[count - 1];
    return `${d} L${last.x} ${last.y}`;
}

/**
 * Builds a smooth SVG path through points with Catmull-Rom splines converted to cubic Beziers.
 *
 * @param points - Points the curve passes through, in order
 * @returns SVG path data
 */
export function smoothPath(points: Point[]): string {
    if (points.length < 3) {
        return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    }
    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        d += ` C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
    }
    return d;
}
