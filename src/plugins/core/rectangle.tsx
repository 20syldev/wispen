import { TextBlock } from "@/components/canvas/text";
import { cornerRadius, dashArray, labelArea } from "@/lib/canvas/render";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";

/**
 * Rounded rectangle with an optional centered label.
 *
 * @param element - Rectangle read for its bounds, corner radius, fill, stroke, dash style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Rectangle({ element, ctx }: ShapeProps) {
    const radius = cornerRadius(element);
    return (
        <>
            <rect
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                rx={radius}
                ry={radius}
                fill={ctx.color(element.fillColor, "fill")}
                stroke={ctx.color(element.strokeColor, "stroke")}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <TextBlock element={element} ctx={ctx} area={labelArea(element)} />
        </>
    );
}

export const rectangleShape: ShapeDefinition = {
    type: "rectangle",
    label: { en: "Rectangle", fr: "Rectangle" },
    kind: "box",
    text: "label",
    fill: true,
    radius: true,
    bindable: true,
    defaultSize: { width: 160, height: 90 },
    Component: Rectangle,
    textBounds: (element) => labelArea(element),
};
