import type { ReactNode } from "react";

import type { Arrowhead, Routing, StrokeStyle, VerticalAlign } from "@/types/scene";

/**
 * Shared frame of the previews: a 16px stroked icon in the current text color, hidden from
 * assistive technologies since the option button carries the accessible name.
 *
 * @param children - SVG content drawn in a 24x24 view box
 * @returns The decorative 16px SVG
 */
function Frame({ children }: { children: ReactNode }) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {children}
        </svg>
    );
}

/**
 * Horizontal stroke drawn thicker as the stroke width grows.
 *
 * @param width - Stroke width of the option in scene pixels (1, 2 or 4)
 * @returns The preview icon, its line 1.2, 2.4 or 4 units thick
 */
export function StrokeWidthPreview({ width }: { width: number }) {
    return (
        <Frame>
            <path d="M4 12h16" strokeWidth={width <= 1 ? 1.2 : width <= 2 ? 2.4 : 4} />
        </Frame>
    );
}

/**
 * Horizontal stroke drawn solid, dashed or dotted.
 *
 * @param style - Stroke style of the option; any value other than dashed or dotted draws solid
 * @returns The decorative preview icon, a horizontal line across the view box
 */
export function StrokeStylePreview({ style }: { style: StrokeStyle }) {
    if (style === "dashed") {
        return (
            <Frame>
                <path d="M3 12h18" strokeDasharray="4.5 3.5" strokeLinecap="butt" />
            </Frame>
        );
    }
    if (style === "dotted") {
        return (
            <Frame>
                <path d="M4 12h16" strokeDasharray="0.01 4" strokeWidth={2.4} />
            </Frame>
        );
    }
    return (
        <Frame>
            <path d="M3 12h18" />
        </Frame>
    );
}

/**
 * Corner drawn sharp, slightly rounded, strongly rounded, or a full pill.
 *
 * @param radius - Corner radius of the option in scene pixels; 9999 stands for the pill
 * @returns The preview icon: a corner, or a stadium for the pill
 */
export function RadiusPreview({ radius }: { radius: number }) {
    if (radius >= 9999) {
        return (
            <Frame>
                <rect x="3.5" y="7.5" width="17" height="9" rx="4.5" />
            </Frame>
        );
    }
    if (radius >= 24) {
        return (
            <Frame>
                <path d="M6 19v-4a9 9 0 0 1 9-9h4" />
            </Frame>
        );
    }
    if (radius > 0) {
        return (
            <Frame>
                <path d="M6 19v-9a4 4 0 0 1 4-4h9" />
            </Frame>
        );
    }
    return (
        <Frame>
            <path d="M6 19V6h13" />
        </Frame>
    );
}

/**
 * Line end carrying an arrowhead, mirrored for the start of the line so the head always points
 * outward.
 *
 * @param kind - Arrowhead style; "none" draws the bare line
 * @param side - End of the line the option applies to
 * @returns The preview icon, mirrored horizontally for the start
 */
export function ArrowheadPreview({ kind, side }: { kind: Arrowhead; side: "start" | "end" }) {
    const lineEnd = kind === "triangle" ? 14 : kind === "dot" ? 15.5 : 20;
    return (
        <Frame>
            <g transform={side === "start" ? "matrix(-1 0 0 1 24 0)" : undefined}>
                <path d={`M4 12H${lineEnd}`} />
                {kind === "arrow" && <path d="M14.5 7l5.5 5-5.5 5" />}
                {kind === "triangle" && <path d="M14 7.5l6 4.5-6 4.5z" fill="currentColor" />}
                {kind === "dot" && <circle cx="18" cy="12" r="2.5" fill="currentColor" />}
                {kind === "bar" && <path d="M20 7v10" />}
            </g>
        </Frame>
    );
}

/**
 * Path between two points drawn straight, with right angles, or as a smooth curve.
 *
 * @param routing - Routing mode of the option; any value other than elbow or curved draws straight
 * @returns The preview icon, whose path always runs from the bottom left to the top right
 */
export function RoutingPreview({ routing }: { routing: Routing }) {
    const d =
        routing === "elbow"
            ? "M4 18h8V6h8"
            : routing === "curved"
              ? "M4 18c8 0 8-12 16-12"
              : "M4 18L20 6";
    return (
        <Frame>
            <path d={d} />
        </Frame>
    );
}

/**
 * Box with a line of text placed at its top, middle or bottom.
 *
 * @param position - Vertical alignment of the option; any value other than top or bottom is middle
 * @returns The preview icon, a faint box holding a bold text line at the matching height
 */
export function TextPositionPreview({ position }: { position: VerticalAlign }) {
    const y = position === "top" ? 8.5 : position === "bottom" ? 15.5 : 12;
    return (
        <Frame>
            <rect x="3.5" y="3.5" width="17" height="17" rx="4" strokeOpacity={0.55} />
            <path d={`M8 ${y}h8`} strokeWidth={2.25} />
        </Frame>
    );
}
