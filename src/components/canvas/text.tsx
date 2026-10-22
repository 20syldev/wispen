import { layoutText } from "@/lib/canvas/text";
import type { RenderContext } from "@/types/plugin";
import type { Bounds, WispenElement } from "@/types/scene";

export interface TextBlockProps {
    element: WispenElement;
    ctx: RenderContext;
    area: Bounds;
    wrap?: boolean;
}

/**
 * Renders the text of an element as SVG lines laid out like the in-place editor, honoring the
 * horizontal and vertical alignment, the font and the decorations. Hidden while the element is
 * edited so the editor overlay is the only visible copy.
 *
 * @param element - Element whose text, font and alignment are drawn
 * @param ctx - Render services resolving fonts and colors, and telling which element is edited
 * @param area - Area the text is laid out in, in scene coordinates
 * @param wrap - Wraps lines at the area width; false lets each line run on
 * @returns The text, or null when the element has no text or is being edited
 */
export function TextBlock({ element, ctx, area, wrap = true }: TextBlockProps) {
    if (!element.text || ctx.editingId === element.id) return null;

    const layout = layoutText(element.text, element, wrap ? Math.max(area.width, 1) : Infinity);
    const top =
        element.verticalAlign === "top"
            ? area.y
            : element.verticalAlign === "bottom"
              ? area.y + area.height - layout.height
              : area.y + (area.height - layout.height) / 2;
    const x =
        element.textAlign === "left"
            ? area.x
            : element.textAlign === "right"
              ? area.x + area.width
              : area.x + area.width / 2;
    const anchor =
        element.textAlign === "left" ? "start" : element.textAlign === "right" ? "end" : "middle";

    return (
        <text
            x={x}
            fontFamily={ctx.font(element.fontFamily)}
            fontSize={element.fontSize}
            fontWeight={element.fontWeight}
            fontStyle={element.fontStyle}
            textDecoration={element.textDecoration}
            textAnchor={anchor}
            dominantBaseline="central"
            fill={ctx.color(element.textColor, "stroke")}
            xmlSpace="preserve"
        >
            {layout.lines.map((line, i) => (
                <tspan key={i} x={x} y={top + layout.lineHeight * (i + 0.5)}>
                    {line || " "}
                </tspan>
            ))}
        </text>
    );
}
