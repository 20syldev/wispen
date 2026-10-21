import { absolutePoints } from "@/lib/canvas/routing";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";
import type { Point } from "@/types/scene";

/**
 * Builds a smooth path through hand-drawn points, using each sample as a quadratic control point
 * between the midpoints of its neighbors.
 *
 * @param points - Samples of the stroke in scene coordinates
 * @returns SVG path data
 */
function strokePath(points: Point[]): string {
    if (points.length < 3)
        return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const mid = {
            x: (points[i].x + points[i + 1].x) / 2,
            y: (points[i].y + points[i + 1].y) / 2,
        };
        d += ` Q${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`;
    }
    const last = points[points.length - 1];
    return `${d} L${last.x} ${last.y}`;
}

/**
 * Hand-drawn stroke; a single tap is drawn as a dot.
 *
 * @param element - Stroke read for its samples, stroke color and width
 * @param ctx - Render services resolving the stroke color
 */
function Freedraw({ element, ctx }: ShapeProps) {
    const points = absolutePoints(element);
    const color = ctx.color(element.strokeColor, "stroke");
    if (points.length === 1) {
        return <circle cx={points[0].x} cy={points[0].y} r={element.strokeWidth} fill={color} />;
    }
    return (
        <path
            d={strokePath(points)}
            fill="none"
            stroke={color}
            strokeWidth={element.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    );
}

export const freedrawShape: ShapeDefinition = {
    type: "freedraw",
    label: { en: "Pencil", fr: "Crayon" },
    kind: "freedraw",
    Component: Freedraw,
};
