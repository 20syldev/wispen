import type { ShapeDefinition, ShapeProps } from "@/types/plugin";

/**
 * Placeholder drawn for element types whose plugin is not installed, so the document still
 * opens and the element can be moved or deleted.
 *
 * @param element - Element of the missing type, read for its bounds and type name shown as caption
 * @param ctx - Render services resolving the gray stroke and the monospace font
 */
function Unknown({ element, ctx }: ShapeProps) {
    return (
        <>
            <rect
                x={element.x}
                y={element.y}
                width={Math.max(element.width, 1)}
                height={Math.max(element.height, 1)}
                rx={8}
                fill="none"
                stroke={ctx.color("gray", "stroke")}
                strokeWidth={1.5}
                strokeDasharray="6 4"
            />
            <text
                x={element.x + element.width / 2}
                y={element.y + element.height / 2}
                fontFamily={ctx.font("jetbrains-mono")}
                fontSize={12}
                textAnchor="middle"
                dominantBaseline="central"
                fill={ctx.color("gray", "stroke")}
            >
                {element.type}
            </text>
        </>
    );
}

export const unknownShape: ShapeDefinition = {
    type: "unknown",
    label: { en: "Unknown shape", fr: "Forme inconnue" },
    kind: "box",
    Component: Unknown,
};
