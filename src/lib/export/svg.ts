import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Scene } from "@/components/canvas/scene";
import { canvasBackground, exportContext } from "@/lib/canvas/colors";
import { elementBounds } from "@/lib/canvas/elements";
import { expandBounds, pointsBounds, unionBounds } from "@/lib/canvas/geometry";
import { labelArea, lineLabel } from "@/lib/canvas/render";
import { computeRoute } from "@/lib/canvas/routing";
import { layoutText } from "@/lib/canvas/text";
import { getShape } from "@/lib/registry";
import type { ExportOptions } from "@/types/plugin";
import type { Bounds, Point, WispenElement } from "@/types/scene";

export const SVG_NS = "http://www.w3.org/2000/svg";

export const XLINK_NS = "http://www.w3.org/1999/xlink";

export type SvgOptions = Pick<ExportOptions, "background" | "theme" | "padding">;

export interface RenderedSvg {
    svg: string;
    width: number;
    height: number;
}

// Extra margin keeping antialiased edges inside the picture when the padding is zero.
const EDGE = 1;

/**
 * Lists points enclosing an arrowhead of any style (arrow, triangle, bar or dot), whose tip sits
 * on the line end and whose body extends backward along the line.
 *
 * @param tip - Line end carrying the arrowhead, in scene coordinates
 * @param angle - Direction the line travels when reaching the tip, in radians
 * @param size - Arrowhead length in scene pixels, as drawn by the linear shape
 * @returns Points whose bounds enclose the arrowhead
 */
function arrowheadPoints(tip: Point, angle: number, size: number): Point[] {
    // Point at a distance behind the tip, rotated by spread from the line direction.
    const at = (length: number, spread: number) => ({
        x: tip.x - length * Math.cos(angle + spread),
        y: tip.y - length * Math.sin(angle + spread),
    });
    return [
        tip,
        at(size, Math.PI / 7),
        at(size, -Math.PI / 7),
        at(size / 2, Math.PI / 2),
        at(size / 2, -Math.PI / 2),
    ];
}

/**
 * Computes the drawn extent of a line or an arrow: its routed path, which leaves the bounds of
 * its points for elbow detours and curves, its arrowheads and its label.
 *
 * @param element - Line or arrow, read for its route, arrowheads, stroke width and label
 * @returns The extent in scene coordinates, strokes included
 */
function linearExtent(element: WispenElement): Bounds {
    const route = computeRoute(element);
    const samples = route.samples;
    const points = [...samples];

    // Must match the arrowhead size of plugins/core/linear.tsx.
    const size = 8 + element.strokeWidth * 3;
    if ((element.startArrowhead ?? "none") !== "none") {
        points.push(...arrowheadPoints(samples[0], route.startAngle, size));
    }
    if ((element.endArrowhead ?? "none") !== "none") {
        points.push(...arrowheadPoints(samples[samples.length - 1], route.endAngle, size));
    }

    const parts = [expandBounds(pointsBounds(points), element.strokeWidth / 2)];
    const label = lineLabel(element, samples);
    if (label) parts.push(label.bounds);
    return unionBounds(parts) as Bounds;
}

/**
 * Computes the area covered by the label of a box shape, which overflows the shape when the
 * text is taller than the label area.
 *
 * @param element - Box element with a label, read for its text, font and alignment
 * @param area - Area the label wraps into, from the shape definition
 * @returns The text block bounds in scene coordinates
 */
function labelExtent(element: WispenElement, area: Bounds): Bounds {
    const layout = layoutText(element.text, element, Math.max(area.width, 1));
    const y =
        element.verticalAlign === "top"
            ? area.y
            : element.verticalAlign === "bottom"
              ? area.y + area.height - layout.height
              : area.y + (area.height - layout.height) / 2;
    const x =
        element.textAlign === "left"
            ? area.x
            : element.textAlign === "right"
              ? area.x + area.width - layout.width
              : area.x + (area.width - layout.width) / 2;
    return { x, y, width: layout.width, height: layout.height };
}

/**
 * Computes the area an element paints: its bounds grown by its stroke, plus arrowheads and
 * labels that overflow them.
 *
 * @param element - Any element; shapes painting outside their bounds declare it with paintMargin
 * @returns The painted extent in scene coordinates
 */
export function elementExtent(element: WispenElement): Bounds {
    const shape = getShape(element.type);
    if (shape.kind === "linear") return linearExtent(element);

    // A single-point freehand stroke is drawn as a dot whose radius is the stroke width.
    const margin =
        shape.paintMargin?.(element) ??
        (shape.kind === "freedraw" ? element.strokeWidth : element.strokeWidth / 2);
    const parts = [expandBounds(elementBounds(element), margin)];
    if (shape.text === "label" && element.text) {
        parts.push(labelExtent(element, shape.textBounds?.(element) ?? labelArea(element)));
    }
    return unionBounds(parts) as Bounds;
}

/**
 * Computes the area painted by a list of elements.
 *
 * @param elements - Elements to export, each measured with elementExtent so strokes, arrowheads
 * and overflowing labels count
 * @returns The union of their extents, or null for an empty list
 */
export function contentBounds(elements: WispenElement[]): Bounds | null {
    return unionBounds(elements.map(elementExtent));
}

/**
 * Moves image sources from href to xlink:href, which older SVG tools still require.
 *
 * @param root - Rendered SVG element, modified in place
 */
function legacyImageLinks(root: Element): void {
    for (const image of Array.from(root.getElementsByTagNameNS(SVG_NS, "image"))) {
        const href = image.getAttribute("href");
        if (href === null) continue;
        image.setAttributeNS(XLINK_NS, "xlink:href", href);
        image.removeAttribute("href");
    }
}

/**
 * Renders elements as a standalone SVG document with the shape components of the canvas,
 * resolving colors and fonts to concrete values. The scene is rendered by React into a detached
 * element and serialized as XML, so no server renderer is needed.
 *
 * @param elements - Elements to draw, bottom to top; an empty list gives a small empty picture
 * @param options - Background, theme and padding (scene pixels around the content)
 * @returns The SVG markup and its size in CSS pixels
 */
export async function renderSvg(
    elements: WispenElement[],
    options: SvgOptions,
): Promise<RenderedSvg> {
    const content = contentBounds(elements) ?? { x: 0, y: 0, width: 0, height: 0 };
    const margin = Math.max(0, options.padding) + EDGE;
    const x = Math.floor(content.x - margin);
    const y = Math.floor(content.y - margin);
    const width = Math.max(1, Math.ceil(content.x + content.width + margin) - x);
    const height = Math.max(1, Math.ceil(content.y + content.height + margin) - y);

    const tree = createElement(
        "svg",
        {
            xmlns: SVG_NS,
            xmlnsXlink: XLINK_NS,
            width,
            height,
            viewBox: `0 0 ${width} ${height}`,
        },
        options.background
            ? createElement("rect", { width, height, fill: canvasBackground(options.theme) })
            : null,
        createElement(
            "g",
            { transform: `translate(${-x} ${-y})` },
            createElement(Scene, { elements, ctx: exportContext(options.theme) }),
        ),
    );

    // flushSync cannot run during a React render or commit (e.g. from an effect): yield first.
    await Promise.resolve();

    const container = document.createElement("div");
    const root = createRoot(container);
    try {
        flushSync(() => root.render(tree));
        const node = container.firstElementChild;
        if (!node) throw new Error("The scene could not be rendered");
        legacyImageLinks(node);
        return { svg: new XMLSerializer().serializeToString(node), width, height };
    } finally {
        root.unmount();
    }
}
