import { polylineMidpoint } from "@/lib/canvas/routing";
import { LABEL_PADDING, layoutText, type TextLayout } from "@/lib/canvas/text";
import type { Bounds, Point, WispenElement } from "@/types/scene";

// Wrapping width of a line label and padding of the paper patch behind it, in scene pixels.
export const LINE_LABEL = { maxWidth: 240, padX: 6, padY: 2 };

export interface LineLabelLayout {
    layout: TextLayout;
    center: Point;
    bounds: Bounds;
}

/**
 * Returns the SVG dash pattern of an element stroke, proportional to its width.
 *
 * @param element - Element read for strokeStyle and strokeWidth
 * @returns A stroke-dasharray value, or undefined for solid strokes
 */
export function dashArray(element: WispenElement): string | undefined {
    const w = Math.max(1, element.strokeWidth);
    if (element.strokeStyle === "dashed") return `${w * 4} ${w * 3}`;
    if (element.strokeStyle === "dotted") return `0 ${w * 2.5}`;
    return undefined;
}

/**
 * Returns the area a box label wraps into: the element bounds inset by a padding.
 *
 * @param element - Box element whose width and height bound the label
 * @param ratio - Share of the width and height usable by the label, below 1 for shapes whose
 * corners are cut (ellipse, diamond)
 * @returns The label area in scene coordinates
 */
export function labelArea(element: WispenElement, ratio = 1): Bounds {
    const width = Math.max(0, element.width * ratio - LABEL_PADDING * 2);
    const height = Math.max(0, element.height * ratio - LABEL_PADDING * 2);
    return {
        x: element.x + (element.width - width) / 2,
        y: element.y + (element.height - height) / 2,
        width,
        height,
    };
}

/**
 * Clamps the corner radius of a box so rounded corners never overlap.
 *
 * @param element - Box element read for radius, width and height
 * @returns The radius to draw, in scene pixels
 */
export function cornerRadius(element: WispenElement): number {
    return Math.max(0, Math.min(element.radius, element.width / 2, element.height / 2));
}

/**
 * Lays out the label of a line or an arrow, centered on the middle of its drawn route.
 *
 * @param element - Linear element, read for its text and font
 * @param samples - Drawn route of the line, as computed by computeRoute
 * @returns The layout, its center and its patch, or null when the line has no text
 */
export function lineLabel(element: WispenElement, samples: Point[]): LineLabelLayout | null {
    if (!element.text) return null;
    const layout = layoutText(element.text, element, LINE_LABEL.maxWidth);
    const center = polylineMidpoint(samples);
    return {
        layout,
        center,
        bounds: {
            x: center.x - layout.width / 2 - LINE_LABEL.padX,
            y: center.y - layout.height / 2 - LINE_LABEL.padY,
            width: layout.width + LINE_LABEL.padX * 2,
            height: layout.height + LINE_LABEL.padY * 2,
        },
    };
}
