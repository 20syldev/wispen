import { TextBlock } from "@/components/canvas/text";
import { dashArray } from "@/lib/canvas/render";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";
import type { WispenElement } from "@/types/scene";

import { cylinderArea, cylinderCap, cylinderHit, cylinderOutline } from "./geometry";

/**
 * Builds the silhouette of the cylinder: both sides joined by the back of the top cap and the
 * front of the bottom cap.
 *
 * @param element - Cylinder read for its position and size
 * @returns SVG path data in scene coordinates
 */
function silhouettePath(element: WispenElement): string {
    const { x, y, width, height } = element;
    const rx = width / 2;
    const ry = cylinderCap(element);
    return [
        `M${x} ${y + ry}`,
        `L${x} ${y + height - ry}`,
        `A${rx} ${ry} 0 0 0 ${x + width} ${y + height - ry}`,
        `L${x + width} ${y + ry}`,
        `A${rx} ${ry} 0 0 0 ${x} ${y + ry}`,
        "Z",
    ].join(" ");
}

/**
 * Builds the front rim of the top cap, drawn over the silhouette to show the lid.
 *
 * @param element - Cylinder read for its position and width
 * @returns SVG path data in scene coordinates
 */
function rimPath(element: WispenElement): string {
    const { x, y, width } = element;
    const ry = cylinderCap(element);
    return `M${x} ${y + ry} A${width / 2} ${ry} 0 0 0 ${x + width} ${y + ry}`;
}

/**
 * Cylinder, the usual symbol of a database or a storage, with its label below the lid.
 *
 * @param element - Cylinder read for its bounds, fill, stroke, dash style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Cylinder({ element, ctx }: ShapeProps) {
    const stroke = ctx.color(element.strokeColor, "stroke");
    return (
        <>
            <path
                d={silhouettePath(element)}
                fill={ctx.color(element.fillColor, "fill")}
                stroke={stroke}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d={rimPath(element)}
                fill="none"
                stroke={stroke}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
                strokeLinecap="round"
            />
            <TextBlock element={element} ctx={ctx} area={cylinderArea(element)} />
        </>
    );
}

export const cylinderShape: ShapeDefinition = {
    type: "cylinder",
    label: { en: "Database", fr: "Base de données" },
    kind: "box",
    text: "label",
    fill: true,
    bindable: true,
    defaultSize: { width: 130, height: 150 },
    Component: Cylinder,
    hitTest: cylinderHit,
    outline: cylinderOutline,
    textBounds: cylinderArea,
};
