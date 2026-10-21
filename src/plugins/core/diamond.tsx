import { TextBlock } from "@/components/canvas/text";
import {
    boundsCenter,
    distanceToPolyline,
    pointInPolygon,
    polygonOutline,
    roundedPath,
} from "@/lib/canvas/geometry";
import { dashArray, labelArea } from "@/lib/canvas/render";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";
import type { Bounds, Point, WispenElement } from "@/types/scene";

/**
 * Returns the four vertices of the diamond inscribed in an element.
 *
 * @param element - Element read for its bounds, whose side midpoints are the vertices
 * @returns Top, right, bottom and left vertices in scene coordinates
 */
function vertices(element: WispenElement): Point[] {
    const { x, y, width, height } = element;
    return [
        { x: x + width / 2, y },
        { x: x + width, y: y + height / 2 },
        { x: x + width / 2, y: y + height },
        { x, y: y + height / 2 },
    ];
}

/**
 * Returns the rectangle inscribed in the diamond, where its label wraps.
 *
 * @param element - Element read for its bounds; the label gets half its width and height
 * @returns The label area in scene coordinates
 */
function diamondTextBounds(element: WispenElement): Bounds {
    return labelArea(element, 0.5);
}

/**
 * Diamond (decision shape) with rounded corners and an optional label.
 *
 * @param element - Diamond read for its bounds, corner radius, style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Diamond({ element, ctx }: ShapeProps) {
    return (
        <>
            <path
                d={roundedPath(vertices(element), element.radius * 0.6, true)}
                fill={ctx.color(element.fillColor, "fill")}
                stroke={ctx.color(element.strokeColor, "stroke")}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <TextBlock element={element} ctx={ctx} area={diamondTextBounds(element)} />
        </>
    );
}

export const diamondShape: ShapeDefinition = {
    type: "diamond",
    label: { en: "Diamond", fr: "Losange" },
    kind: "box",
    text: "label",
    fill: true,
    radius: true,
    bindable: true,
    defaultSize: { width: 160, height: 110 },
    Component: Diamond,
    hitTest: (element, point, tolerance) => {
        const polygon = vertices(element);
        return (
            pointInPolygon(point, polygon) ||
            distanceToPolyline(point, [...polygon, polygon[0]]) <= tolerance
        );
    },
    outline: (element, toward) => polygonOutline(vertices(element), boundsCenter(element), toward),
    textBounds: diamondTextBounds,
};
