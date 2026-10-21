import { roundedPath } from "@/lib/canvas/geometry";
import type { Binding, Point, Side, WispenElement } from "@/types/scene";

export interface Route {
    d: string;
    samples: Point[];
    startAngle: number;
    endAngle: number;
}

// Distance, in scene pixels, an elbow connector keeps from the shapes it leaves or reaches.
const ELBOW_MARGIN = 24;

// Corner rounding of elbow connectors, in scene pixels.
const ELBOW_RADIUS = 10;

/**
 * Converts the relative points of a linear element to scene coordinates.
 *
 * @param element - Linear or freehand element
 * @returns Absolute points, empty when the element has none
 */
export function absolutePoints(element: WispenElement): Point[] {
    return (element.points ?? []).map((p) => ({ x: element.x + p.x, y: element.y + p.y }));
}

/**
 * Infers the side of a shape a binding is attached to, from its fixed anchor, or from the side
 * recorded on elbow connectors bound to the outline.
 *
 * @param binding - Start or end binding; missing ones yield null
 * @returns The side for anchors lying on an edge and recorded sides, or null for free anchors
 * and plain outline bindings
 */
export function bindingSide(binding: Binding | null | undefined): Side | null {
    if (!binding) return null;
    const anchor = binding.anchor;
    if (!anchor) return binding.side ?? null;
    const epsilon = 0.02;
    if (anchor.x <= epsilon) return "w";
    if (anchor.x >= 1 - epsilon) return "e";
    if (anchor.y <= epsilon) return "n";
    if (anchor.y >= 1 - epsilon) return "s";
    return null;
}

/**
 * Tells whether a side leaves horizontally.
 *
 * @param side - Side of a bound shape, as returned by bindingSide
 * @returns true for east and west
 */
function horizontal(side: Side): boolean {
    return side === "e" || side === "w";
}

/**
 * Returns the outward direction of a side along its axis.
 *
 * @param side - Side of a bound shape, as returned by bindingSide
 * @returns 1 for east and south, -1 for west and north
 */
function outward(side: Side): number {
    return side === "e" || side === "s" ? 1 : -1;
}

/**
 * Moves a point away from a side by the elbow margin, where a connector turns for the first or
 * last time.
 *
 * @param point - Endpoint lying next to the side
 * @param side - Side the connector leaves or reaches
 * @returns The point ELBOW_MARGIN further out along the side normal
 */
function stub(point: Point, side: Side): Point {
    const offset = outward(side) * ELBOW_MARGIN;
    return horizontal(side)
        ? { x: point.x + offset, y: point.y }
        : { x: point.x, y: point.y + offset };
}

/**
 * Removes consecutive duplicates and collinear middle points from an orthogonal polyline,
 * always keeping both ends so a route never collapses to a single point.
 *
 * @param points - Polyline vertices, at least two
 * @returns The simplified polyline, at least two points
 */
function simplify(points: Point[]): Point[] {
    const unique = points.filter(
        (p, i) =>
            i === 0 ||
            Math.abs(p.x - points[i - 1].x) > 0.01 ||
            Math.abs(p.y - points[i - 1].y) > 0.01,
    );
    if (unique.length < 2) return [points[0], points[points.length - 1]];
    return unique.filter((p, i) => {
        if (i === 0 || i === unique.length - 1) return true;
        const a = unique[i - 1];
        const b = unique[i + 1];
        return !(
            (Math.abs(a.x - p.x) < 0.01 && Math.abs(b.x - p.x) < 0.01) ||
            (Math.abs(a.y - p.y) < 0.01 && Math.abs(b.y - p.y) < 0.01)
        );
    });
}

/**
 * Computes an orthogonal connector between two points, leaving and reaching the given sides
 * when known and taking a detour when the sides face away from each other.
 *
 * @param start - Scene position where the connector leaves, usually a bound outline point
 * @param end - Scene position where the connector arrives, usually a bound outline point
 * @param startSide - Side of the shape the connector leaves, or null to infer it
 * @param endSide - Side of the shape the connector reaches, or null to infer it
 * @returns Polyline vertices from start to end
 */
export function elbowRoute(
    start: Point,
    end: Point,
    startSide: Side | null,
    endSide: Side | null,
): Point[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const startHorizontal = startSide ? horizontal(startSide) : Math.abs(dx) >= Math.abs(dy);
    const endHorizontal = endSide ? horizontal(endSide) : startHorizontal;

    if (startHorizontal && endHorizontal) {
        const out = startSide ? outward(startSide) : Math.sign(dx) || 1;
        const back = endSide ? outward(endSide) : -out;
        const midX = (start.x + end.x) / 2;
        if (
            (midX - start.x) * out >= ELBOW_MARGIN / 2 &&
            (midX - end.x) * back >= ELBOW_MARGIN / 2
        ) {
            return simplify([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
        }
        const a = start.x + out * ELBOW_MARGIN;
        const b = end.x + back * ELBOW_MARGIN;
        const midY = (start.y + end.y) / 2;
        return simplify([
            start,
            { x: a, y: start.y },
            { x: a, y: midY },
            { x: b, y: midY },
            { x: b, y: end.y },
            end,
        ]);
    }

    if (!startHorizontal && !endHorizontal) {
        const out = startSide ? outward(startSide) : Math.sign(dy) || 1;
        const back = endSide ? outward(endSide) : -out;
        const midY = (start.y + end.y) / 2;
        if (
            (midY - start.y) * out >= ELBOW_MARGIN / 2 &&
            (midY - end.y) * back >= ELBOW_MARGIN / 2
        ) {
            return simplify([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]);
        }
        const a = start.y + out * ELBOW_MARGIN;
        const b = end.y + back * ELBOW_MARGIN;
        const midX = (start.x + end.x) / 2;
        return simplify([
            start,
            { x: start.x, y: a },
            { x: midX, y: a },
            { x: midX, y: b },
            { x: end.x, y: b },
            end,
        ]);
    }

    const corner = startHorizontal ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
    const leaves =
        !startSide ||
        (startHorizontal ? corner.x - start.x : corner.y - start.y) * outward(startSide) > 0;
    const arrives =
        !endSide || (endHorizontal ? corner.x - end.x : corner.y - end.y) * outward(endSide) > 0;
    if (leaves && arrives) return simplify([start, corner, end]);

    // The direct corner would cross a shape: step out of both sides first, then turn once.
    const a = startSide ? stub(start, startSide) : start;
    const b = endSide ? stub(end, endSide) : end;
    const bend = startHorizontal ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
    return simplify([start, a, bend, b, end]);
}

/**
 * Samples a cubic Bezier segment.
 *
 * @param p0 - Start point
 * @param c1 - First control point
 * @param c2 - Second control point
 * @param p1 - End point
 * @param steps - Number of samples, start point excluded
 * @returns Points along the curve, ending at p1
 */
function sampleCubic(p0: Point, c1: Point, c2: Point, p1: Point, steps: number): Point[] {
    const out: Point[] = [];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        out.push({
            x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
            y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
        });
    }
    return out;
}

/**
 * Builds the curved route through the points, with Catmull-Rom tangents, or a single S-curve
 * leaving and reaching the bound sides when there are only two points.
 *
 * @param points - Absolute points, at least two
 * @param startSide - Side the curve leaves, if bound to a fixed anchor
 * @param endSide - Side the curve reaches, if bound to a fixed anchor
 * @returns Cubic segments as [start, control1, control2, end] tuples
 */
function curveSegments(points: Point[], startSide: Side | null, endSide: Side | null): Point[][] {
    if (points.length === 2) {
        const [s, e] = points;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const along = Math.abs(dx) >= Math.abs(dy);
        const pull = Math.max(Math.abs(along ? dx : dy) / 2, 30);
        const direction = (side: Side | null, sign: number): Point => {
            if (side)
                return horizontal(side) ? { x: outward(side), y: 0 } : { x: 0, y: outward(side) };
            return along
                ? { x: sign * (Math.sign(dx) || 1), y: 0 }
                : { x: 0, y: sign * (Math.sign(dy) || 1) };
        };
        const d1 = direction(startSide, 1);
        const d2 = direction(endSide, -1);
        return [
            [
                s,
                { x: s.x + d1.x * pull, y: s.y + d1.y * pull },
                { x: e.x + d2.x * pull, y: e.y + d2.y * pull },
                e,
            ],
        ];
    }

    const segments: Point[][] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        segments.push([
            p1,
            { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
            { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
            p2,
        ]);
    }
    return segments;
}

/**
 * Computes the angle of the direction from one point to another.
 *
 * @param from - Point the direction starts from, in scene coordinates
 * @param to - Point the direction aims at, in scene coordinates
 * @returns The angle in radians
 */
function angle(from: Point, to: Point): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Computes the drawn path of a linear element according to its routing mode.
 *
 * @param element - Line or arrow element with at least two points
 * @returns Path data, sampled polyline and end directions for arrowheads
 */
export function computeRoute(element: WispenElement): Route {
    const points = absolutePoints(element);
    if (points.length < 2) {
        const p = points[0] ?? { x: element.x, y: element.y };
        return { d: `M${p.x} ${p.y}`, samples: [p], startAngle: 0, endAngle: 0 };
    }

    const startSide = bindingSide(element.startBinding);
    const endSide = bindingSide(element.endBinding);
    const routing = element.routing ?? "straight";

    if (routing === "elbow") {
        const ends = [points[0], points[points.length - 1]];
        const routed = elbowRoute(ends[0], ends[1], startSide, endSide);
        const route = routed.length >= 2 ? routed : ends;
        const n = route.length;
        return {
            d: roundedPath(route, ELBOW_RADIUS, false),
            samples: route,
            startAngle: angle(route[1], route[0]),
            endAngle: angle(route[n - 2], route[n - 1]),
        };
    }

    if (routing === "curved") {
        const segments = curveSegments(points, startSide, endSide);
        let d = `M${points[0].x} ${points[0].y}`;
        const samples: Point[] = [points[0]];
        for (const [p0, c1, c2, p1] of segments) {
            d += ` C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p1.x} ${p1.y}`;
            samples.push(...sampleCubic(p0, c1, c2, p1, 16));
        }
        const first = segments[0];
        const last = segments[segments.length - 1];
        return {
            d,
            samples,
            startAngle: angle(first[1], first[0]),
            endAngle: angle(last[2], last[3]),
        };
    }

    const n = points.length;
    return {
        d: points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" "),
        samples: points,
        startAngle: angle(points[1], points[0]),
        endAngle: angle(points[n - 2], points[n - 1]),
    };
}

/**
 * Computes the drawn middle of each segment between consecutive points, where a new bend can be
 * grabbed: the curve point halfway through the segment for curved lines, the chord middle
 * otherwise.
 *
 * @param element - Line or arrow with at least two points
 * @returns One point per segment, in scene coordinates
 */
export function segmentMidpoints(element: WispenElement): Point[] {
    const points = absolutePoints(element);
    if (points.length < 2) return [];
    if (element.routing === "curved") {
        const segments = curveSegments(
            points,
            bindingSide(element.startBinding),
            bindingSide(element.endBinding),
        );
        return segments.map(([p0, c1, c2, p1]) => ({
            x: (p0.x + 3 * c1.x + 3 * c2.x + p1.x) / 8,
            y: (p0.y + 3 * c1.y + 3 * c2.y + p1.y) / 8,
        }));
    }
    return points
        .slice(1)
        .map((b, i) => ({ x: (points[i].x + b.x) / 2, y: (points[i].y + b.y) / 2 }));
}

/**
 * Finds the point halfway along a polyline, where linear labels are centered.
 *
 * @param samples - Polyline vertices
 * @returns The midpoint by length
 */
export function polylineMidpoint(samples: Point[]): Point {
    if (samples.length === 1) return samples[0];
    const lengths: number[] = [];
    let total = 0;
    for (let i = 1; i < samples.length; i++) {
        const length = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
        lengths.push(length);
        total += length;
    }
    let remaining = total / 2;
    for (let i = 0; i < lengths.length; i++) {
        if (remaining <= lengths[i] && lengths[i] > 0) {
            const t = remaining / lengths[i];
            return {
                x: samples[i].x + (samples[i + 1].x - samples[i].x) * t,
                y: samples[i].y + (samples[i + 1].y - samples[i].y) * t,
            };
        }
        remaining -= lengths[i];
    }
    return samples[samples.length - 1];
}
