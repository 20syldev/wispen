import { TextBlock } from "@/components/canvas/text";
import { boundsCenter, polygonOutline, roundedPath } from "@/lib/canvas/geometry";
import { dashArray } from "@/lib/canvas/render";
import type { RenderContext, ShapeDefinition, ShapeProps } from "@/types/plugin";
import type { Bounds, Point, WispenElement } from "@/types/scene";

import {
    calloutArea,
    calloutPoints,
    hexagonArea,
    hexagonPoints,
    parallelogramArea,
    parallelogramPoints,
    polygonHit,
    starArea,
    starCenter,
    starPoints,
    triangleArea,
    trianglePoints,
} from "./geometry";

export interface PolygonProps {
    element: WispenElement;
    ctx: RenderContext;
    points: Point[];
    radius: number;
    area: Bounds;
}

/**
 * Closed polygon with rounded corners, the element fill and stroke, and its label. Shared by
 * every polygonal shape of the plugin.
 *
 * @param element - Element read for its fill, stroke, dash style and label
 * @param ctx - Render services resolving colors and fonts
 * @param points - Vertices in scene coordinates, implicitly closed
 * @param radius - Corner rounding in scene pixels; negative values count as zero
 * @param area - Where the label wraps, in scene coordinates
 */
function Polygon({ element, ctx, points, radius, area }: PolygonProps) {
    return (
        <>
            <path
                d={roundedPath(points, Math.max(0, radius), true)}
                fill={ctx.color(element.fillColor, "fill")}
                stroke={ctx.color(element.strokeColor, "stroke")}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <TextBlock element={element} ctx={ctx} area={area} />
        </>
    );
}

/**
 * Triangle pointing up; acute corners take a smaller rounding to keep their shape.
 *
 * @param element - Triangle read for its bounds, corner radius, style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Triangle({ element, ctx }: ShapeProps) {
    return (
        <Polygon
            element={element}
            ctx={ctx}
            points={trianglePoints(element)}
            radius={element.radius * 0.6}
            area={triangleArea(element)}
        />
    );
}

/**
 * Flat-topped hexagon, the flowchart preparation step.
 *
 * @param element - Hexagon read for its bounds, corner radius, style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Hexagon({ element, ctx }: ShapeProps) {
    return (
        <Polygon
            element={element}
            ctx={ctx}
            points={hexagonPoints(element)}
            radius={element.radius * 0.8}
            area={hexagonArea(element)}
        />
    );
}

/**
 * Parallelogram leaning right, the flowchart input and output step.
 *
 * @param element - Parallelogram read for its bounds, corner radius, style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Parallelogram({ element, ctx }: ShapeProps) {
    return (
        <Polygon
            element={element}
            ctx={ctx}
            points={parallelogramPoints(element)}
            radius={element.radius * 0.8}
            area={parallelogramArea(element)}
        />
    );
}

/**
 * Five-pointed star; only a light rounding so the tips stay pointed.
 *
 * @param element - Star read for its bounds, corner radius, style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Star({ element, ctx }: ShapeProps) {
    return (
        <Polygon
            element={element}
            ctx={ctx}
            points={starPoints(element)}
            radius={element.radius * 0.3}
            area={starArea(element)}
        />
    );
}

/**
 * Speech bubble with a tail toward the bottom-left corner.
 *
 * @param element - Speech bubble read for its bounds, corner radius, style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Callout({ element, ctx }: ShapeProps) {
    return (
        <Polygon
            element={element}
            ctx={ctx}
            points={calloutPoints(element)}
            radius={element.radius}
            area={calloutArea(element)}
        />
    );
}

export const triangleShape: ShapeDefinition = {
    type: "triangle",
    label: { en: "Triangle", fr: "Triangle" },
    kind: "box",
    text: "label",
    fill: true,
    radius: true,
    bindable: true,
    defaultSize: { width: 140, height: 120 },
    Component: Triangle,
    hitTest: (element, point, tolerance) => polygonHit(trianglePoints(element), point, tolerance),
    outline: (element, toward) =>
        polygonOutline(trianglePoints(element), boundsCenter(element), toward),
    textBounds: triangleArea,
};

export const hexagonShape: ShapeDefinition = {
    type: "hexagon",
    label: { en: "Hexagon", fr: "Hexagone" },
    kind: "box",
    text: "label",
    fill: true,
    radius: true,
    bindable: true,
    defaultSize: { width: 160, height: 100 },
    Component: Hexagon,
    hitTest: (element, point, tolerance) => polygonHit(hexagonPoints(element), point, tolerance),
    outline: (element, toward) =>
        polygonOutline(hexagonPoints(element), boundsCenter(element), toward),
    textBounds: hexagonArea,
};

export const parallelogramShape: ShapeDefinition = {
    type: "parallelogram",
    label: { en: "Parallelogram", fr: "Parallélogramme" },
    kind: "box",
    text: "label",
    fill: true,
    radius: true,
    bindable: true,
    defaultSize: { width: 170, height: 90 },
    Component: Parallelogram,
    hitTest: (element, point, tolerance) =>
        polygonHit(parallelogramPoints(element), point, tolerance),
    outline: (element, toward) =>
        polygonOutline(parallelogramPoints(element), boundsCenter(element), toward),
    textBounds: parallelogramArea,
};

export const starShape: ShapeDefinition = {
    type: "star",
    label: { en: "Star", fr: "Étoile" },
    kind: "box",
    text: "label",
    fill: true,
    radius: true,
    bindable: true,
    defaultSize: { width: 150, height: 144 },
    Component: Star,
    hitTest: (element, point, tolerance) => polygonHit(starPoints(element), point, tolerance),
    outline: (element, toward) => polygonOutline(starPoints(element), starCenter(element), toward),
    textBounds: starArea,
};

export const calloutShape: ShapeDefinition = {
    type: "callout",
    label: { en: "Speech bubble", fr: "Bulle" },
    kind: "box",
    text: "label",
    fill: true,
    radius: true,
    bindable: true,
    defaultSize: { width: 180, height: 120 },
    Component: Callout,
    hitTest: (element, point, tolerance) => polygonHit(calloutPoints(element), point, tolerance),
    outline: (element, toward) =>
        polygonOutline(calloutPoints(element), boundsCenter(element), toward),
    textBounds: calloutArea,
};
