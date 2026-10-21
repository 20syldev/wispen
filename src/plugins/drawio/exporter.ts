import { getFont } from "@/data/fonts";
import { exportContext } from "@/lib/canvas/colors";
import { elementBounds } from "@/lib/canvas/elements";
import { distanceToSegment, unionBounds } from "@/lib/canvas/geometry";
import { absolutePoints, computeRoute } from "@/lib/canvas/routing";
import { LABEL_PADDING } from "@/lib/canvas/text";
import { getShape, hasShape } from "@/lib/registry";
import { CALLOUT, cylinderCap, hexagonInset, parallelogramSkew } from "@/plugins/shapes/geometry";
import type { ExportInput, RenderContext } from "@/types/plugin";
import type { Arrowhead, Binding, Page, Point, WispenElement } from "@/types/scene";

import { htmlLabel, xmlNode } from "./xml";

export const DRAWIO_MIME = "application/vnd.jgraph.mxfile";

type StyleEntry = string | [string, string | number];

interface PageContext {
    ctx: RenderContext;
    offset: Point;
    ids: Set<string>;
}

// Margin left between the origin of the diagram and the content, in pixels.
const MARGIN = 40;

// Distance under which freehand samples are merged, in pixels; keeps files small.
const FREEDRAW_TOLERANCE = 1.5;

/**
 * The draw.io marker drawn like each arrowhead, and whether it is filled. "open" is the same
 * chevron as "arrow" and "baseDash" the same perpendicular bar as "bar" ("classic" and "dash"
 * would be filled or slanted).
 */
const MARKERS: Record<Arrowhead, { name: string; fill: boolean }> = {
    none: { name: "none", fill: false },
    arrow: { name: "open", fill: false },
    triangle: { name: "block", fill: true },
    dot: { name: "oval", fill: true },
    bar: { name: "baseDash", fill: false },
};

/**
 * Rounds a coordinate to two decimals to keep the file readable.
 *
 * @param value - Length or coordinate in scene pixels, possibly negative
 * @returns The number with at most two decimals
 */
function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Serializes style entries to a draw.io style string.
 *
 * @param entries - Tokens and key/value pairs, in order
 * @returns The style, each entry followed by a semicolon
 */
function styleString(entries: StyleEntry[]): string {
    return entries
        .map((entry) => (typeof entry === "string" ? entry : `${entry[0]}=${entry[1]}`))
        .map((entry) => `${entry};`)
        .join("");
}

/**
 * Builds a cell id that cannot collide with the two root cells "0" and "1".
 *
 * @param id - Element id, possibly a digit string such as an id written by another tool
 * @returns The draw.io cell id
 */
function cellId(id: string): string {
    return `wispen-${id}`;
}

/**
 * Returns the style entries rounding the corners of a shape. Polygonal draw.io shapes read
 * arcSize as an absolute size, rectangles need absoluteArcSize for that.
 *
 * @param radius - Corner radius in pixels, 0 for sharp corners
 * @param rectangle - Adds absoluteArcSize, which rectangles need
 * @returns The rounded and arcSize entries (arcSize is twice the radius), with absoluteArcSize added
 * when rectangle is true; only rounded=0 for a radius of 0 or less
 */
function rounding(radius: number, rectangle = false): StyleEntry[] {
    if (radius <= 0) return [["rounded", 0]];
    const entries: StyleEntry[] = [
        ["rounded", 1],
        ["arcSize", round(radius * 2)],
    ];
    return rectangle ? [...entries, ["absoluteArcSize", 1]] : entries;
}

/**
 * Returns the draw.io shape of a box element. Plugin shapes map to their draw.io equivalent,
 * and anything unknown falls back to a rounded rectangle carrying the same label.
 *
 * @param element - Box element read for its type, size and corner radius
 * @returns Style entries selecting the shape and its geometry parameters
 */
function shapeEntries(element: WispenElement): StyleEntry[] {
    switch (element.type) {
        case "ellipse":
            return ["ellipse"];
        case "diamond":
            return ["rhombus", ...rounding(element.radius * 0.6)];
        case "text":
            return ["text"];
        case "sticky":
            return [...rounding(element.radius, true), ["shadow", 1]];
        case "triangle":
            return ["triangle", ["direction", "north"], ...rounding(element.radius * 0.6)];
        case "hexagon":
            return [
                ["shape", "hexagon"],
                ["perimeter", "hexagonPerimeter2"],
                ["fixedSize", 1],
                ["size", round(hexagonInset(element))],
                ...rounding(element.radius * 0.8),
            ];
        case "parallelogram":
            return [
                ["shape", "parallelogram"],
                ["perimeter", "parallelogramPerimeter"],
                ["fixedSize", 1],
                ["size", round(parallelogramSkew(element))],
                ...rounding(element.radius * 0.8),
            ];
        case "cylinder":
            return [
                ["shape", "cylinder3"],
                ["boundedLbl", 1],
                ["backgroundOutline", 1],
                ["size", round(cylinderCap(element))],
            ];
        case "star":
            return [["shape", "mxgraph.basic.star"]];
        case "callout":
            return [
                ["shape", "callout"],
                ["perimeter", "calloutPerimeter"],
                ["size", round(element.height * (1 - CALLOUT.body))],
                ["position", CALLOUT.baseStart],
                ["base", round(element.width * (CALLOUT.baseEnd - CALLOUT.baseStart))],
                ["position2", CALLOUT.tip],
                ...rounding(element.radius),
            ];
        default:
            return rounding(element.radius, true);
    }
}

/**
 * Returns the stroke, opacity and lock entries of an element.
 *
 * @param element - Element read for its stroke style, opacity and lock
 * @param ctx - Export render context, used to resolve the palette key of the stroke to a concrete
 * color
 * @param stroke - Resolved stroke color, "none" to hide the outline; the element stroke by
 * default
 * @returns The strokeColor and strokeWidth entries, then the dash pattern for dashed and dotted
 * styles, the opacity pair below 100 and the lock flag
 */
function strokeEntries(
    element: WispenElement,
    ctx: RenderContext,
    stroke = ctx.color(element.strokeColor, "stroke"),
): StyleEntry[] {
    const entries: StyleEntry[] = [
        ["strokeColor", stroke],
        ["strokeWidth", element.strokeWidth],
    ];
    if (element.strokeStyle === "dashed") entries.push(["dashed", 1], ["dashPattern", "4 3"]);
    if (element.strokeStyle === "dotted") entries.push(["dashed", 1], ["dashPattern", "1 2"]);
    if (element.opacity < 100) {
        entries.push(["opacity", element.opacity], ["textOpacity", element.opacity]);
    }
    if (element.locked) entries.push(["locked", 1]);
    return entries;
}

/**
 * Returns the font and alignment entries of an element label. The font is named after its
 * label and loaded from Google Fonts by draw.io through fontSource.
 *
 * @param element - Element read for its text properties
 * @param ctx - Export render context, used to resolve the text color
 * @returns The fontColor, fontSize, fontFamily, fontSource, fontStyle (bitmask of bold, italic,
 * underline and line-through) and horizontal and vertical alignment entries
 */
function textEntries(element: WispenElement, ctx: RenderContext): StyleEntry[] {
    const font = getFont(element.fontFamily);
    const source = `https://fonts.googleapis.com/css?family=${font.label.replace(/ /g, "+")}`;
    let fontStyle = 0;
    if (element.fontWeight === "bold") fontStyle |= 1;
    if (element.fontStyle === "italic") fontStyle |= 2;
    if (element.textDecoration === "underline") fontStyle |= 4;
    if (element.textDecoration === "line-through") fontStyle |= 8;
    return [
        ["fontColor", ctx.color(element.textColor, "stroke")],
        ["fontSize", element.fontSize],
        ["fontFamily", font.label],
        ["fontSource", encodeURIComponent(source)],
        ["fontStyle", fontStyle],
        ["align", element.textAlign],
        ["verticalAlign", element.verticalAlign],
    ];
}

/**
 * Returns the connection constraint of a bound end attached to a fixed anchor.
 *
 * @param prefix - "exit" for the start, "entry" for the end
 * @param binding - Binding of the end, whose anchor ratios become the constraint
 * @param page - Page context listing the written cells, a binding to a skipped element is ignored
 * @returns The X, Y, Dx and Dy entries with the given prefix, empty for free ends and outline
 * bindings
 */
function anchorEntries(
    prefix: "exit" | "entry",
    binding: Binding | null | undefined,
    page: PageContext,
): StyleEntry[] {
    if (!binding?.anchor || !page.ids.has(binding.elementId)) return [];
    return [
        [`${prefix}X`, round(binding.anchor.x)],
        [`${prefix}Y`, round(binding.anchor.y)],
        [`${prefix}Dx`, 0],
        [`${prefix}Dy`, 0],
    ];
}

/**
 * Returns the marker entries of one end of an edge.
 *
 * @param end - Which end to write, selecting the startArrow and startFill or endArrow and endFill
 * entries
 * @param head - Arrowhead of that end, missing meaning none
 * @returns The Arrow and Fill pair of that end, Fill being 1 only for filled markers
 */
function markerEntries(end: "start" | "end", head: Arrowhead | undefined): StyleEntry[] {
    const marker = MARKERS[head ?? "none"];
    return [
        [`${end}Arrow`, marker.name],
        [`${end}Fill`, marker.fill ? 1 : 0],
    ];
}

/**
 * Converts a data URL to the form draw.io expects in a style, where ";" separates entries:
 * the ";base64" marker is dropped and the payload is always base64. Other URLs are kept with
 * their semicolons encoded.
 *
 * @param src - Source of an image element, normally a data URL; missing for broken elements
 * @returns The value of the image style entry, or null when the source is unusable
 */
function imageSource(src: string | undefined): string | null {
    if (!src) return null;
    const match = /^data:([^;,]+)((?:;[^;,]*)*),([\s\S]*)$/.exec(src);
    if (!match) return src.replace(/;/g, "%3B");
    const [, mime, parameters, payload] = match;
    if (parameters.split(";").includes("base64")) return `data:${mime},${payload}`;
    try {
        const bytes = new TextEncoder().encode(decodeURIComponent(payload));
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return `data:${mime},${btoa(binary)}`;
    } catch {
        return null;
    }
}

/**
 * Keeps the samples of a polyline needed to stay within a tolerance of the original
 * (Douglas-Peucker), marking them in `keep`.
 *
 * @param points - Polyline vertices, not modified
 * @param first - Index of the first vertex of the span, always kept
 * @param last - Index of the last vertex of the span, always kept
 * @param tolerance - Maximum distance between the original and the simplified line
 * @param keep - Flags of the kept vertices, updated in place
 */
function simplifySpan(
    points: Point[],
    first: number,
    last: number,
    tolerance: number,
    keep: boolean[],
): void {
    let farthest = -1;
    let max = tolerance;
    for (let i = first + 1; i < last; i++) {
        const d = distanceToSegment(points[i], points[first], points[last]);
        if (d > max) {
            max = d;
            farthest = i;
        }
    }
    if (farthest < 0) return;
    keep[farthest] = true;
    simplifySpan(points, first, farthest, tolerance, keep);
    simplifySpan(points, farthest, last, tolerance, keep);
}

/**
 * Simplifies a freehand polyline.
 *
 * @param points - Samples of the stroke
 * @returns The samples worth keeping, first and last included
 */
function simplify(points: Point[]): Point[] {
    if (points.length <= 2) return points;
    const keep = points.map((_, i) => i === 0 || i === points.length - 1);
    simplifySpan(points, 0, points.length - 1, FREEDRAW_TOLERANCE, keep);
    return points.filter((_, i) => keep[i]);
}

/**
 * Translates a scene point into the diagram coordinates.
 *
 * @param point - Position in scene coordinates
 * @param page - Page context holding the offset
 * @returns The diagram point, rounded
 */
function shift(point: Point, page: PageContext): Point {
    return { x: round(point.x + page.offset.x), y: round(point.y + page.offset.y) };
}

/**
 * Builds a vertex cell.
 *
 * @param element - Element the cell represents; its id gives the cell id and its box the geometry
 * @param value - Label markup, already in draw.io HTML form
 * @param style - draw.io style string, written as is into the cell
 * @param page - Page context translating the geometry
 * @returns The lines of the cell
 */
function vertexCell(
    element: WispenElement,
    value: string,
    style: string,
    page: PageContext,
): string[] {
    const origin = shift(element, page);
    return xmlNode(
        "mxCell",
        { id: cellId(element.id), value, style, vertex: 1, parent: 1 },
        xmlNode("mxGeometry", {
            x: origin.x,
            y: origin.y,
            width: round(element.width),
            height: round(element.height),
            as: "geometry",
        }),
    );
}

/**
 * Builds an edge cell from explicit end points and waypoints.
 *
 * @param element - Linear element the edge represents; its id gives the cell id and its bindings
 * the source and target, when those elements are exported too
 * @param style - draw.io style string, written as is into the cell
 * @param points - End points and waypoints in scene coordinates, at least two
 * @param waypoints - Writes the inner points of `points` as waypoints; elbow edges leave the
 * routing to draw.io
 * @param page - Page context translating the points and listing the valid terminals
 * @returns The lines of the cell
 */
function edgeCell(
    element: WispenElement,
    style: string,
    points: Point[],
    waypoints: boolean,
    page: PageContext,
): string[] {
    const source = element.startBinding?.elementId;
    const target = element.endBinding?.elementId;
    const start = shift(points[0], page);
    const end = shift(points[points.length - 1], page);
    const inner = waypoints ? points.slice(1, -1).map((p) => shift(p, page)) : [];
    return xmlNode(
        "mxCell",
        {
            id: cellId(element.id),
            value: htmlLabel(element.text),
            style,
            edge: 1,
            parent: 1,
            source: source && page.ids.has(source) ? cellId(source) : undefined,
            target: target && page.ids.has(target) ? cellId(target) : undefined,
        },
        xmlNode("mxGeometry", { relative: 1, as: "geometry" }, [
            ...xmlNode("mxPoint", { x: start.x, y: start.y, as: "sourcePoint" }),
            ...xmlNode("mxPoint", { x: end.x, y: end.y, as: "targetPoint" }),
            ...(inner.length > 0
                ? xmlNode(
                      "Array",
                      { as: "points" },
                      inner.flatMap((p) => xmlNode("mxPoint", { x: p.x, y: p.y })),
                  )
                : []),
        ]),
    );
}

/**
 * Converts a line or an arrow to an edge. Straight and curved lines keep their inner vertices
 * as waypoints, and two-point curves get a few samples so draw.io bends them as well; elbow
 * connectors are left to the orthogonal router of draw.io.
 *
 * @param element - Line or arrow, with its routing, arrowheads, bindings and label
 * @param page - Page context resolving colors and listing the valid terminals
 * @returns The lines of the cell, empty for a degenerate line
 */
function linearCell(element: WispenElement, page: PageContext): string[] {
    const points = absolutePoints(element);
    if (points.length < 2) return [];
    const routing = element.routing ?? "straight";
    const style = styleString([
        ["edgeStyle", routing === "elbow" ? "orthogonalEdgeStyle" : "none"],
        ["rounded", routing === "elbow" ? 1 : 0],
        ...(routing === "curved" ? [["curved", 1] as StyleEntry] : []),
        ["html", 1],
        ...markerEntries("start", element.startArrowhead),
        ...markerEntries("end", element.endArrowhead),
        ...strokeEntries(element, page.ctx),
        ...textEntries(element, page.ctx),
        ["labelBackgroundColor", "default"],
        ...anchorEntries("exit", element.startBinding, page),
        ...anchorEntries("entry", element.endBinding, page),
    ]);

    if (routing === "curved" && points.length === 2) {
        const samples = computeRoute(element).samples;
        const last = samples.length - 1;
        const bent = [0, 0.25, 0.5, 0.75, 1].map((t) => samples[Math.round(t * last)]);
        return edgeCell(element, style, bent, true, page);
    }
    return edgeCell(element, style, points, routing !== "elbow", page);
}

/**
 * Converts a freehand stroke to a smoothed edge through its simplified samples; a single tap
 * becomes a small filled circle.
 *
 * @param element - Freehand stroke read for its points, stroke and opacity
 * @param page - Page context resolving colors and translating the points
 * @returns The lines of the cell, empty without points
 */
function freedrawCell(element: WispenElement, page: PageContext): string[] {
    const points = absolutePoints(element);
    if (points.length === 0) return [];
    const stroke = page.ctx.color(element.strokeColor, "stroke");
    if (points.length === 1) {
        const r = element.strokeWidth;
        const dot = {
            ...element,
            x: points[0].x - r,
            y: points[0].y - r,
            width: r * 2,
            height: r * 2,
        };
        const style = styleString([
            "ellipse",
            ["html", 1],
            ["fillColor", stroke],
            ...strokeEntries(element, page.ctx, "none"),
        ]);
        return vertexCell(dot, "", style, page);
    }
    const style = styleString([
        ["edgeStyle", "none"],
        ["curved", 1],
        ["rounded", 0],
        ["html", 1],
        ["startArrow", "none"],
        ["endArrow", "none"],
        ...strokeEntries(element, page.ctx, stroke),
    ]);
    return edgeCell(element, style, simplify(points), true, page);
}

/**
 * Converts a picture to an image vertex with its data embedded in the style.
 *
 * @param element - Image element read for its source, border, opacity and lock
 * @param page - Page context resolving colors and translating the geometry
 * @returns The lines of the cell, empty when the picture has no usable source
 */
function imageCell(element: WispenElement, page: PageContext): string[] {
    const image = imageSource(element.src);
    if (!image) return [];
    const bordered = element.strokeColor !== "transparent" && element.strokeWidth > 0;
    const style = styleString([
        ["shape", "image"],
        ["html", 1],
        ["imageAspect", 0],
        ["aspect", "fixed"],
        ["verticalLabelPosition", "bottom"],
        ["verticalAlign", "top"],
        ...(bordered
            ? [
                  ["imageBorder", page.ctx.color(element.strokeColor, "stroke")] as StyleEntry,
                  ["strokeWidth", element.strokeWidth] as StyleEntry,
              ]
            : []),
        ...(element.opacity < 100 ? [["opacity", element.opacity] as StyleEntry] : []),
        ...(element.locked ? [["locked", 1] as StyleEntry] : []),
        ["image", image],
    ]);
    return vertexCell(element, "", style, page);
}

/**
 * Converts a box element (core, plugin or unknown shape) to a vertex with its label.
 *
 * @param element - Box element of any registered or unknown type, text blocks included
 * @param page - Page context resolving colors and translating the geometry
 * @returns The lines of the cell
 */
function boxCell(element: WispenElement, page: PageContext): string[] {
    const shape = getShape(element.type);
    const text = element.type === "text";
    const filled = !text && (hasShape(element.type) ? shape.fill === true : true);
    const style = styleString([
        ...shapeEntries(element),
        ["whiteSpace", text && element.autoSize !== false ? "nowrap" : "wrap"],
        ["html", 1],
        ["fillColor", filled ? page.ctx.color(element.fillColor, "fill") : "none"],
        ...strokeEntries(element, page.ctx, text ? "none" : undefined),
        ...textEntries(element, page.ctx),
        ...(text ? [] : [["spacing", LABEL_PADDING] as StyleEntry]),
    ]);
    return vertexCell(element, htmlLabel(element.text), style, page);
}

/**
 * Converts one element to its draw.io cell.
 *
 * @param element - Element to convert; its type picks an image, linear, freedraw or box cell
 * @param page - Page context shared by every element of the page
 * @returns The lines of the cell, empty when the element cannot be represented
 */
function elementCell(element: WispenElement, page: PageContext): string[] {
    if (element.type === "image") return imageCell(element, page);
    const kind = getShape(element.type).kind;
    if (kind === "linear") return linearCell(element, page);
    if (kind === "freedraw") return freedrawCell(element, page);
    return boxCell(element, page);
}

/**
 * Converts a page to a draw.io diagram, translated so its content starts near the origin.
 *
 * @param page - Page to export; its id and name become the diagram attributes, and its
 * elements are converted in order
 * @param ctx - Export render context of the light theme
 * @returns The lines of the diagram element
 */
function diagram(page: Page, ctx: RenderContext): string[] {
    const bounds = unionBounds(page.elements.map(elementBounds));
    const context: PageContext = {
        ctx,
        offset: bounds ? { x: MARGIN - bounds.x, y: MARGIN - bounds.y } : { x: 0, y: 0 },
        ids: new Set(
            page.elements
                .filter((el) => el.type !== "image" || imageSource(el.src) !== null)
                .map((el) => el.id),
        ),
    };
    const cells = page.elements.flatMap((element) => elementCell(element, context));
    return xmlNode("diagram", { id: page.id, name: page.name }, [
        ...xmlNode(
            "mxGraphModel",
            {
                grid: 1,
                gridSize: 10,
                guides: 1,
                tooltips: 1,
                connect: 1,
                arrows: 1,
                fold: 1,
                page: 0,
                pageScale: 1,
                pageWidth: 850,
                pageHeight: 1100,
                math: 0,
                shadow: 0,
            },
            xmlNode("root", {}, [
                ...xmlNode("mxCell", { id: 0 }),
                ...xmlNode("mxCell", { id: 1, parent: 0 }),
                ...cells,
            ]),
        ),
    ]);
}

/**
 * Builds an uncompressed .drawio file with one diagram per page, colors resolved for the light
 * theme. Groups are flattened since draw.io groups need relative geometry.
 *
 * @param pages - Pages to export, one diagram each in the same order
 * @returns The XML document
 */
export function buildDrawio(pages: Page[]): string {
    const ctx = exportContext("light");
    const lines = xmlNode(
        "mxfile",
        {
            host: "wispen",
            agent: "wispen",
            modified: new Date().toISOString(),
            pages: pages.length,
        },
        pages.flatMap((page) => diagram(page, ctx)),
    );
    return `${lines.join("\n")}\n`;
}

/**
 * Exports the active page or the whole document as a .drawio file.
 *
 * @param input - Export input with the pages of the chosen scope
 * @returns The XML file
 */
export async function exportDrawio(input: ExportInput): Promise<Blob> {
    return new Blob([buildDrawio(input.pages)], { type: DRAWIO_MIME });
}
