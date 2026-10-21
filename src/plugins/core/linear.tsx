import { dashArray, lineLabel, type LineLabelLayout } from "@/lib/canvas/render";
import { computeRoute } from "@/lib/canvas/routing";
import type { RenderContext, ShapeDefinition, ShapeProps } from "@/types/plugin";
import type { Arrowhead, Point, WispenElement } from "@/types/scene";

/**
 * Builds the path of an arrowhead whose tip sits on a line end.
 *
 * @param kind - Arrowhead style: "arrow" is open, "triangle" and "dot" are closed, "bar" crosses
 * the line
 * @param tip - Line end in scene coordinates
 * @param angle - Direction the line travels when reaching the tip, in radians
 * @param size - Arrowhead length in scene pixels
 * @returns SVG path data, empty for "none"
 */
function arrowheadPath(kind: Arrowhead, tip: Point, angle: number, size: number): string {
    const at = (length: number, spread: number) => ({
        x: tip.x - length * Math.cos(angle + spread),
        y: tip.y - length * Math.sin(angle + spread),
    });
    if (kind === "arrow" || kind === "triangle") {
        const a = at(size, Math.PI / 7);
        const b = at(size, -Math.PI / 7);
        return kind === "arrow"
            ? `M${a.x} ${a.y} L${tip.x} ${tip.y} L${b.x} ${b.y}`
            : `M${a.x} ${a.y} L${tip.x} ${tip.y} L${b.x} ${b.y} Z`;
    }
    if (kind === "bar") {
        const a = at(size / 2, Math.PI / 2);
        const b = at(size / 2, -Math.PI / 2);
        return `M${a.x} ${a.y} L${b.x} ${b.y}`;
    }
    if (kind === "dot") {
        const r = size / 3.2;
        const c = at(r, 0);
        return `M${c.x - r} ${c.y} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;
    }
    return "";
}

/**
 * Draws one arrowhead with the line color, filled for triangles and dots.
 *
 * @param kind - Arrowhead style; "none" renders nothing
 * @param tip - Line end the arrowhead points to, in scene coordinates
 * @param angle - Direction the line travels when reaching the tip, in radians
 * @param element - Line read for its stroke color and width
 * @param ctx - Render services resolving the color
 */
function Head({
    kind,
    tip,
    angle,
    element,
    ctx,
}: {
    kind: Arrowhead;
    tip: Point;
    angle: number;
    element: WispenElement;
    ctx: RenderContext;
}) {
    if (kind === "none") return null;
    const color = ctx.color(element.strokeColor, "stroke");
    const filled = kind === "triangle" || kind === "dot";
    return (
        <path
            d={arrowheadPath(kind, tip, angle, 8 + element.strokeWidth * 3)}
            fill={filled ? color : "none"}
            stroke={color}
            strokeWidth={element.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    );
}

/**
 * Draws the label of a line centered on its middle, over a patch of canvas color so the line
 * does not cross the text. The patch is also the area where a click selects the line.
 *
 * @param element - Line read for its font properties and text color
 * @param ctx - Render services resolving colors and fonts
 * @param label - Layout from lineLabel: wrapped lines, center and patch in scene coordinates
 */
function LineLabel({
    element,
    ctx,
    label,
}: {
    element: WispenElement;
    ctx: RenderContext;
    label: LineLabelLayout;
}) {
    if (ctx.editingId === element.id) return null;
    const { layout, center, bounds } = label;
    const top = center.y - layout.height / 2;
    return (
        <g>
            <rect
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                rx={6}
                fill={ctx.color("paper", "fill")}
            />
            <text
                fontFamily={ctx.font(element.fontFamily)}
                fontSize={element.fontSize}
                fontWeight={element.fontWeight}
                fontStyle={element.fontStyle}
                textDecoration={element.textDecoration}
                textAnchor="middle"
                dominantBaseline="central"
                fill={ctx.color(element.textColor, "stroke")}
                xmlSpace="preserve"
            >
                {layout.lines.map((line, i) => (
                    <tspan key={i} x={center.x} y={top + layout.lineHeight * (i + 0.5)}>
                        {line || " "}
                    </tspan>
                ))}
            </text>
        </g>
    );
}

/**
 * Line or arrow following its routing mode (straight, elbow or curved), with arrowheads and an
 * optional label at mid-length.
 *
 * @param element - Line or arrow read for its points, routing, arrowheads, style and label
 * @param ctx - Render services resolving colors and fonts
 */
function Linear({ element, ctx }: ShapeProps) {
    const route = computeRoute(element);
    const samples = route.samples;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const label = lineLabel(element, samples);
    return (
        <>
            <path
                d={route.d}
                fill="none"
                stroke={ctx.color(element.strokeColor, "stroke")}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Head
                kind={element.startArrowhead ?? "none"}
                tip={first}
                angle={route.startAngle}
                element={element}
                ctx={ctx}
            />
            <Head
                kind={element.endArrowhead ?? "none"}
                tip={last}
                angle={route.endAngle}
                element={element}
                ctx={ctx}
            />
            {label && <LineLabel element={element} ctx={ctx} label={label} />}
        </>
    );
}

export const arrowShape: ShapeDefinition = {
    type: "arrow",
    label: { en: "Arrow", fr: "Flèche" },
    kind: "linear",
    text: "label",
    defaults: { textAlign: "center", verticalAlign: "middle" },
    Component: Linear,
};

export const lineShape: ShapeDefinition = {
    type: "line",
    label: { en: "Line", fr: "Ligne" },
    kind: "linear",
    text: "label",
    defaults: {
        startArrowhead: "none",
        endArrowhead: "none",
        textAlign: "center",
        verticalAlign: "middle",
    },
    Component: Linear,
};
