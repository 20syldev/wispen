import { TextBlock } from "@/components/canvas/text";
import { ellipseOutline, pointInEllipse } from "@/lib/canvas/geometry";
import { dashArray, labelArea } from "@/lib/canvas/render";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";
import type { Bounds, WispenElement } from "@/types/scene";

/**
 * Returns the rectangle inscribed in the ellipse, where its label wraps.
 *
 * @param element - Element read for its bounds; the label gets 1/sqrt(2) of its width and height
 * @returns The label area in scene coordinates
 */
function ellipseTextBounds(element: WispenElement): Bounds {
    return labelArea(element, Math.SQRT1_2);
}

/**
 * Ellipse inscribed in the element bounds, with an optional label in its inner rectangle.
 *
 * @param element - Ellipse read for its bounds, fill, stroke, dash style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Ellipse({ element, ctx }: ShapeProps) {
    return (
        <>
            <ellipse
                cx={element.x + element.width / 2}
                cy={element.y + element.height / 2}
                rx={element.width / 2}
                ry={element.height / 2}
                fill={ctx.color(element.fillColor, "fill")}
                stroke={ctx.color(element.strokeColor, "stroke")}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
                strokeLinecap="round"
            />
            <TextBlock element={element} ctx={ctx} area={ellipseTextBounds(element)} />
        </>
    );
}

export const ellipseShape: ShapeDefinition = {
    type: "ellipse",
    label: { en: "Ellipse", fr: "Ellipse" },
    kind: "box",
    text: "label",
    fill: true,
    bindable: true,
    defaultSize: { width: 140, height: 100 },
    Component: Ellipse,
    hitTest: (element, point, tolerance) => pointInEllipse(point, element, tolerance),
    outline: (element, toward) => ellipseOutline(element, toward),
    textBounds: ellipseTextBounds,
};
