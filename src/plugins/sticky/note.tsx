import { TextBlock } from "@/components/canvas/text";
import { roundedPath } from "@/lib/canvas/geometry";
import { cornerRadius, dashArray } from "@/lib/canvas/render";
import { LABEL_PADDING } from "@/lib/canvas/text";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";
import type { Bounds, Point, WispenElement } from "@/types/scene";

/**
 * Returns the size of the folded corner: proportional to the note, capped so large notes keep
 * a discreet fold.
 *
 * @param element - Sticky note read for its width and height
 * @returns Length of the fold along each edge, in scene pixels
 */
function foldSize(element: WispenElement): number {
    return Math.min(Math.min(element.width, element.height) * 0.14, 28);
}

/**
 * Returns the outline of the note: a rectangle whose bottom-right corner is cut by the fold.
 *
 * @param element - Sticky note read for its position and size
 * @param fold - Length of the fold along each edge in scene pixels, as given by foldSize
 * @returns Vertices in scene coordinates, clockwise from the top-left corner
 */
function bodyPoints(element: WispenElement, fold: number): Point[] {
    const { x, y, width, height } = element;
    return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height - fold },
        { x: x + width - fold, y: y + height },
        { x, y: y + height },
    ];
}

/**
 * Returns the triangle of paper folded back over the note.
 *
 * @param element - Sticky note read for its bottom-right corner
 * @param fold - Length of the fold along each edge in scene pixels, as given by foldSize
 * @returns Vertices in scene coordinates, the right angle last
 */
function flapPoints(element: WispenElement, fold: number): Point[] {
    const right = element.x + element.width;
    const bottom = element.y + element.height;
    return [
        { x: right, y: bottom - fold },
        { x: right - fold, y: bottom },
        { x: right - fold, y: bottom - fold },
    ];
}

/**
 * Returns the area the text of a note wraps into: generous margins, and room left for the fold
 * at the bottom. Margins shrink on small notes so a thin strip still shows its text inside.
 *
 * @param element - Sticky note read for its position and size
 * @returns The label area in scene coordinates
 */
function noteTextBounds(element: WispenElement): Bounds {
    const padding = Math.min(LABEL_PADDING + 4, Math.min(element.width, element.height) * 0.1);
    const bottom = Math.max(padding, foldSize(element));
    return {
        x: element.x + padding,
        y: element.y + padding,
        width: Math.max(0, element.width - padding * 2),
        height: Math.max(0, element.height - padding - bottom),
    };
}

/**
 * Sizes the drop shadow after the note, so small and large notes keep the same depth.
 *
 * @param element - Sticky note read for its width and height
 * @returns The blur radius and the vertical offset of the shadow, in scene pixels
 */
function shadowMetrics(element: WispenElement): { blur: number; offset: number } {
    return {
        blur: Math.max(2.5, Math.min(element.width, element.height) * 0.025),
        offset: Math.max(2, element.height * 0.015),
    };
}

/**
 * Sticky note: a rounded sheet with a folded bottom-right corner and a soft drop shadow. The
 * shadow blurs the alpha channel of the sheet, so it carries no color of its own; its region is
 * sized in scene units so thin notes never clip it, and its id is derived from the element id
 * (characters invalid in url() replaced) so notes and exported files never share or lose it.
 * The fold is shaded with the ink color at a low opacity, darker in the light theme and lighter
 * in the dark one.
 *
 * @param element - Sticky note read for its bounds, corner radius, fill, stroke and label
 * @param ctx - Render services resolving fill, stroke and ink colors
 */
function StickyNote({ element, ctx }: ShapeProps) {
    const fold = foldSize(element);
    const radius = cornerRadius(element);
    const fill = ctx.color(element.fillColor, "fill");
    const stroke = ctx.color(element.strokeColor, "stroke");
    const filterId = `sticky-shadow-${element.id.replace(/[^\w-]/g, "_")}`;
    const flap = roundedPath(flapPoints(element, fold), Math.min(radius, fold / 4), true);
    const { blur, offset } = shadowMetrics(element);
    const margin = blur * 3 + element.strokeWidth;

    return (
        <>
            <defs>
                <filter
                    id={filterId}
                    filterUnits="userSpaceOnUse"
                    x={element.x - margin}
                    y={element.y - margin}
                    width={element.width + margin * 2}
                    height={element.height + margin * 2 + offset}
                >
                    <feGaussianBlur in="SourceAlpha" stdDeviation={blur} />
                    <feOffset dx={0} dy={offset} result="offset" />
                    <feComponentTransfer in="offset" result="shadow">
                        <feFuncA type="linear" slope={0.16} />
                    </feComponentTransfer>
                    <feMerge>
                        <feMergeNode in="shadow" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <path
                d={roundedPath(bodyPoints(element, fold), radius, true)}
                fill={fill}
                stroke={stroke}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${filterId})`}
            />
            <path d={flap} fill={fill} />
            <path
                d={flap}
                fill={ctx.color("ink", "stroke")}
                fillOpacity={0.1}
                stroke={stroke}
                strokeWidth={element.strokeWidth}
                strokeLinejoin="round"
            />
            <TextBlock element={element} ctx={ctx} area={noteTextBounds(element)} />
        </>
    );
}

export const stickyShape: ShapeDefinition = {
    type: "sticky",
    label: { en: "Sticky note", fr: "Note adhésive" },
    paintMargin: (element) => {
        const { blur, offset } = shadowMetrics(element);
        return blur * 3 + offset + element.strokeWidth / 2;
    },
    kind: "box",
    text: "label",
    fill: true,
    radius: true,
    bindable: true,
    defaults: {
        fillColor: "yellow",
        strokeColor: "transparent",
        radius: 6,
        fontFamily: "caveat",
        fontSize: 28,
        textAlign: "left",
        verticalAlign: "top",
    },
    defaultSize: { width: 200, height: 200 },
    Component: StickyNote,
    textBounds: noteTextBounds,
};
