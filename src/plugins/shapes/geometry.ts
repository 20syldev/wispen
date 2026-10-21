import {
    boundsCenter,
    distanceToPolyline,
    pointInEllipse,
    pointInPolygon,
} from "@/lib/canvas/geometry";
import { LABEL_PADDING } from "@/lib/canvas/text";
import type { Bounds, Point, WispenElement } from "@/types/scene";

/**
 * Proportions of the speech bubble: the share of the height taken by the bubble body, then the
 * horizontal positions of the tail base (start and end) and of the tail tip as shares of the
 * width. The draw.io exporter reuses them.
 */
export const CALLOUT = { body: 0.78, baseStart: 0.22, baseEnd: 0.4, tip: 0.14 } as const;

// Inner radius of the star relative to its outer one; above the regular 0.38 for a softer look.
const STAR_INNER = 0.48;

/**
 * Shrinks an area by the label padding on every side.
 *
 * @param area - Area in scene coordinates
 * @returns The padded area, never negative
 */
export function padded(area: Bounds): Bounds {
    const width = Math.max(0, area.width - LABEL_PADDING * 2);
    const height = Math.max(0, area.height - LABEL_PADDING * 2);
    return {
        x: area.x + (area.width - width) / 2,
        y: area.y + (area.height - height) / 2,
        width,
        height,
    };
}

/**
 * Tests a point against a closed polygon, counting points near its outline as hits.
 *
 * @param polygon - Vertices in scene coordinates, implicitly closed
 * @param point - Pointer position in scene coordinates
 * @param tolerance - Hit margin around the outline, in scene pixels
 * @returns true when the point is inside or close to the outline
 */
export function polygonHit(polygon: Point[], point: Point, tolerance: number): boolean {
    return (
        pointInPolygon(point, polygon) ||
        distanceToPolyline(point, [...polygon, polygon[0]]) <= tolerance
    );
}

/**
 * Returns the vertices of the triangle pointing up inscribed in an element.
 *
 * @param element - Triangle read for its position and size
 * @returns Apex, bottom-right and bottom-left vertices
 */
export function trianglePoints(element: WispenElement): Point[] {
    const { x, y, width, height } = element;
    return [
        { x: x + width / 2, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
    ];
}

/**
 * Returns the largest rectangle inscribed in the triangle, where its label wraps.
 *
 * @param element - Triangle read for its position and size
 * @returns The label area in scene coordinates
 */
export function triangleArea(element: WispenElement): Bounds {
    return padded({
        x: element.x + element.width / 4,
        y: element.y + element.height / 2,
        width: element.width / 2,
        height: element.height / 2,
    });
}

/**
 * Returns how far the left and right points of the hexagon sit from its top corners.
 *
 * @param element - Hexagon read for its size; flat hexagons get a smaller inset
 * @returns Horizontal inset in scene pixels
 */
export function hexagonInset(element: WispenElement): number {
    return Math.min(element.width * 0.25, element.height * 0.5);
}

/**
 * Returns the vertices of the flat-topped hexagon inscribed in an element.
 *
 * @param element - Hexagon read for its position and size
 * @returns Six vertices clockwise from the top-left corner
 */
export function hexagonPoints(element: WispenElement): Point[] {
    const { x, y, width, height } = element;
    const inset = hexagonInset(element);
    return [
        { x: x + inset, y },
        { x: x + width - inset, y },
        { x: x + width, y: y + height / 2 },
        { x: x + width - inset, y: y + height },
        { x: x + inset, y: y + height },
        { x, y: y + height / 2 },
    ];
}

/**
 * Returns the label area of the hexagon, between its slanted sides.
 *
 * @param element - Hexagon read for its position and size
 * @returns The label area in scene coordinates
 */
export function hexagonArea(element: WispenElement): Bounds {
    const inset = hexagonInset(element) * 0.6;
    return padded({
        x: element.x + inset,
        y: element.y,
        width: Math.max(0, element.width - inset * 2),
        height: element.height,
    });
}

/**
 * Returns the horizontal offset between the top and bottom edges of the parallelogram.
 *
 * @param element - Parallelogram read for its size; low shapes get a smaller skew
 * @returns Skew in scene pixels
 */
export function parallelogramSkew(element: WispenElement): number {
    return Math.min(element.width * 0.2, element.height * 0.6);
}

/**
 * Returns the vertices of the parallelogram leaning right inscribed in an element.
 *
 * @param element - Parallelogram read for its position and size
 * @returns Four vertices clockwise from the top-left corner
 */
export function parallelogramPoints(element: WispenElement): Point[] {
    const { x, y, width, height } = element;
    const skew = parallelogramSkew(element);
    return [
        { x: x + skew, y },
        { x: x + width, y },
        { x: x + width - skew, y: y + height },
        { x, y: y + height },
    ];
}

/**
 * Returns the label area of the parallelogram, between its slanted sides at mid-height.
 *
 * @param element - Parallelogram read for its position and size
 * @returns The label area in scene coordinates
 */
export function parallelogramArea(element: WispenElement): Bounds {
    const skew = parallelogramSkew(element) * 0.6;
    return padded({
        x: element.x + skew,
        y: element.y,
        width: Math.max(0, element.width - skew * 2),
        height: element.height,
    });
}

/**
 * Returns the vertices of a five-pointed star stretched to fill the element bounds exactly,
 * so selection handles and arrow bindings hug the drawn shape.
 *
 * @param element - Star read for its position and size, possibly not square
 * @returns Ten vertices alternating outer and inner points, starting at the top
 */
export function starPoints(element: WispenElement): Point[] {
    const unit = Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : STAR_INNER;
        return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
    });
    const minX = Math.min(...unit.map((p) => p.x));
    const maxX = Math.max(...unit.map((p) => p.x));
    const minY = Math.min(...unit.map((p) => p.y));
    const maxY = Math.max(...unit.map((p) => p.y));
    return unit.map((p) => ({
        x: element.x + ((p.x - minX) / (maxX - minX)) * element.width,
        y: element.y + ((p.y - minY) / (maxY - minY)) * element.height,
    }));
}

/**
 * Returns the center of the star, which sits below the middle of its bounds since the top
 * point reaches further than the bottom ones.
 *
 * @param element - Star read for its position and size
 * @returns The center in scene coordinates
 */
export function starCenter(element: WispenElement): Point {
    const bottom = Math.sin((3 * Math.PI) / 10);
    return { x: element.x + element.width / 2, y: element.y + element.height / (1 + bottom) };
}

/**
 * Returns the label area of the star, around its center.
 *
 * @param element - Star read for its position and size
 * @returns The label area in scene coordinates
 */
export function starArea(element: WispenElement): Bounds {
    const center = starCenter(element);
    const width = element.width * 0.5;
    const height = element.height * 0.34;
    return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

/**
 * Returns the vertices of the speech bubble: a rectangle with a tail leaving its bottom edge
 * toward the bottom-left corner.
 *
 * @param element - Speech bubble read for its position and size
 * @returns Seven vertices clockwise from the top-left corner
 */
export function calloutPoints(element: WispenElement): Point[] {
    const { x, y, width, height } = element;
    const bottom = y + height * CALLOUT.body;
    return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: bottom },
        { x: x + width * CALLOUT.baseEnd, y: bottom },
        { x: x + width * CALLOUT.tip, y: y + height },
        { x: x + width * CALLOUT.baseStart, y: bottom },
        { x, y: bottom },
    ];
}

/**
 * Returns the label area of the speech bubble, its body without the tail.
 *
 * @param element - Speech bubble read for its position and size
 * @returns The label area in scene coordinates
 */
export function calloutArea(element: WispenElement): Bounds {
    return padded({
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height * CALLOUT.body,
    });
}

/**
 * Returns the vertical radius of the cylinder caps.
 *
 * @param element - Cylinder read for its size; wide cylinders get deeper caps
 * @returns Radius in scene pixels, at most a quarter of the height
 */
export function cylinderCap(element: WispenElement): number {
    return Math.min(element.height / 4, Math.max(6, element.width * 0.12));
}

/**
 * Returns the label area of the cylinder, below its top cap.
 *
 * @param element - Cylinder read for its position and size
 * @returns The label area in scene coordinates
 */
export function cylinderArea(element: WispenElement): Bounds {
    const cap = cylinderCap(element);
    return padded({
        x: element.x,
        y: element.y + cap * 2,
        width: element.width,
        height: Math.max(0, element.height - cap * 3),
    });
}

/**
 * Tests a point against the cylinder: its body or one of its elliptic caps.
 *
 * @param element - Cylinder read for its position and size
 * @param point - Pointer position in scene coordinates
 * @param tolerance - Hit margin in scene pixels
 * @returns true when the point touches the cylinder
 */
export function cylinderHit(element: WispenElement, point: Point, tolerance: number): boolean {
    const cap = cylinderCap(element);
    const inBody =
        point.x >= element.x - tolerance &&
        point.x <= element.x + element.width + tolerance &&
        point.y >= element.y + cap &&
        point.y <= element.y + element.height - cap;
    const capBounds = (top: number) => ({
        x: element.x,
        y: top - cap,
        width: element.width,
        height: cap * 2,
    });
    return (
        inBody ||
        pointInEllipse(point, capBounds(element.y + cap), tolerance) ||
        pointInEllipse(point, capBounds(element.y + element.height - cap), tolerance)
    );
}

/**
 * Intersects the ray from the cylinder center toward a point with the cylinder outline. The
 * cylinder is the convex union of a rectangle and two ellipses, so the outline lies at the
 * farthest exit of the ray among the three parts.
 *
 * @param element - Cylinder read for its position and size
 * @param toward - Direction target; the center itself yields the center
 * @returns The outline point in scene coordinates
 */
export function cylinderOutline(element: WispenElement, toward: Point): Point {
    const center = boundsCenter(element);
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    const rx = element.width / 2;
    const ry = cylinderCap(element);
    if ((dx === 0 && dy === 0) || rx <= 0 || ry <= 0) return center;

    const halfBody = element.height / 2 - ry;
    let best = Math.min(
        dx === 0 ? Infinity : rx / Math.abs(dx),
        dy === 0 ? Infinity : halfBody / Math.abs(dy),
    );

    for (const capY of [element.y + ry, element.y + element.height - ry]) {
        const oy = center.y - capY;
        const a = (dx / rx) ** 2 + (dy / ry) ** 2;
        const b = (2 * oy * dy) / ry ** 2;
        const c = (oy / ry) ** 2 - 1;
        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) best = Math.max(best, (-b + Math.sqrt(discriminant)) / (2 * a));
    }
    return { x: center.x + dx * best, y: center.y + dy * best };
}
