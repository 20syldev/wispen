import { connectionPoints } from "@/lib/canvas/binding";
import { elementBounds } from "@/lib/canvas/elements";
import { expandBounds } from "@/lib/canvas/geometry";
import {
    getHandles,
    type Handle,
    SELECTION_PADDING,
    selectionBounds,
    singleLinear,
} from "@/lib/canvas/handles";
import type { Bounds, WispenElement } from "@/types/scene";

export interface OverlayProps {
    selected: WispenElement[];
    zoom: number;
    marquee: Bounds | null;
    bindingTarget: WispenElement | null;
    editing: boolean;
}

/**
 * Outline of an area at a constant screen thickness.
 *
 * @param bounds - Area in scene coordinates
 * @param zoom - Viewport zoom, dividing padding and radius so they stay constant on screen
 * @param dashed - Draws a dashed outline, used for locked elements and members of a selection
 * @returns The outline rectangle
 */
function Outline({
    bounds,
    zoom,
    dashed = false,
}: {
    bounds: Bounds;
    zoom: number;
    dashed?: boolean;
}) {
    const padded = expandBounds(bounds, SELECTION_PADDING / zoom);
    return (
        <rect
            x={padded.x}
            y={padded.y}
            width={padded.width}
            height={padded.height}
            rx={4 / zoom}
            className="fill-none stroke-selection"
            strokeWidth={1.5}
            strokeDasharray={dashed ? "4 4" : undefined}
            vectorEffect="non-scaling-stroke"
        />
    );
}

/**
 * One selection handle: a ring of the selection color. Midpoint handles, which add a bend to a
 * line, are smaller translucent dots.
 *
 * @param handle - Handle read for its kind and position in scene coordinates
 * @param size - Handle size in scene pixels, already divided by the zoom
 * @returns The handle circle
 */
function HandleMark({ handle, size }: { handle: Handle; size: number }) {
    const { x, y } = handle.point;
    if (handle.kind === "midpoint") {
        return (
            <circle
                cx={x}
                cy={y}
                r={size / 2.8}
                className="fill-selection stroke-background opacity-60"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
            />
        );
    }
    return (
        <circle
            cx={x}
            cy={y}
            r={size / 1.9}
            className="fill-background stroke-selection"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
        />
    );
}

/**
 * Pill under the selection showing its size in scene pixels.
 *
 * @param bounds - Selection bounds in scene coordinates
 * @param zoom - Current zoom, so the pill keeps a constant screen size
 * @returns The pill with its label
 */
function SizeLabel({ bounds, zoom }: { bounds: Bounds; zoom: number }) {
    const label = `${Math.round(bounds.width)} x ${Math.round(bounds.height)}`;
    const width = (label.length * 6.6 + 16) / zoom;
    const height = 20 / zoom;
    const x = bounds.x + bounds.width / 2 - width / 2;
    const y = bounds.y + bounds.height + (SELECTION_PADDING + 8) / zoom;
    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={height / 2}
                className="fill-primary"
            />
            <text
                x={x + width / 2}
                y={y + height / 2}
                fontSize={11 / zoom}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-primary-foreground font-num font-semibold tabular-nums"
            >
                {label}
            </text>
        </g>
    );
}

/**
 * Editing chrome drawn above the scene: selection outlines, resize and point handles, the
 * marquee and the arrow attachment highlight. Sizes are divided by the zoom so they stay
 * constant on screen.
 *
 * @param selected - Selected elements, locked ones included; locked ones get no handles
 * @param zoom - Viewport zoom, dividing every size so the chrome keeps a constant screen size
 * @param marquee - Rubber-band area in scene coordinates, or null when no marquee is dragged
 * @param bindingTarget - Element an arrow end would attach to, or null when there is none
 * @param editing - True while a text is edited in place, which hides handles and size label
 * @returns The SVG group of the editing chrome
 */
export function Overlay({ selected, zoom, marquee, bindingTarget, editing }: OverlayProps) {
    const unlocked = selected.filter((el) => !el.locked);
    const bounds = selectionBounds(selected);
    const linear = singleLinear(selected);
    const handles = editing ? [] : getHandles(unlocked, zoom);
    const size = 9 / zoom;

    return (
        <g>
            {selected.length > 1 &&
                selected.map((el) => (
                    <Outline key={el.id} bounds={elementBounds(el)} zoom={zoom} dashed />
                ))}
            {bounds && !linear && (
                <Outline bounds={bounds} zoom={zoom} dashed={unlocked.length === 0} />
            )}

            {handles.map((handle) => (
                <HandleMark
                    key={
                        handle.kind === "resize"
                            ? `r-${handle.id}`
                            : `${handle.kind}-${handle.index}`
                    }
                    handle={handle}
                    size={size}
                />
            ))}

            {bounds && !linear && !editing && unlocked.length > 0 && (
                <SizeLabel bounds={bounds} zoom={zoom} />
            )}

            {bindingTarget && (
                <g>
                    <rect
                        x={bindingTarget.x - 4 / zoom}
                        y={bindingTarget.y - 4 / zoom}
                        width={bindingTarget.width + 8 / zoom}
                        height={bindingTarget.height + 8 / zoom}
                        rx={8 / zoom}
                        className="fill-selection/5 stroke-selection"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                    />
                    {connectionPoints(bindingTarget).map((p, i) => (
                        <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={4 / zoom}
                            className="fill-selection stroke-background"
                            strokeWidth={1.5}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                </g>
            )}

            {marquee && (
                <rect
                    x={marquee.x}
                    y={marquee.y}
                    width={marquee.width}
                    height={marquee.height}
                    rx={2 / zoom}
                    className="fill-selection/8 stroke-selection"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                />
            )}
        </g>
    );
}
