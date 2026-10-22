import type { Viewport } from "@/types/scene";
import type { GridType } from "@/types/settings";

export interface GridProps {
    viewport: Viewport;
    type: GridType;
    size: number;
}

/**
 * Background grid drawn in screen space with an SVG pattern that follows the pan and zoom.
 * The spacing doubles while cells would be smaller than 10 screen pixels, so zooming out never
 * turns the grid into noise. Line grids emphasize every fifth line.
 *
 * @param viewport - Pan and zoom of the page, giving the cell size and the pattern offset
 * @param type - "dots" draws one dot per cell, any other type draws lines
 * @param size - Cell size in scene pixels, before the zoom and the spacing doubling
 * @returns The pattern and the rectangle filling the surface with it, or null when the size is 0
 */
export function Grid({ viewport, type, size }: GridProps) {
    let cell = size * viewport.zoom;
    while (cell > 0 && cell < 10) cell *= 2;
    if (cell <= 0) return null;

    const major = cell * 5;
    const offsetX = ((viewport.x % major) + major) % major;
    const offsetY = ((viewport.y % major) + major) % major;
    const dot = Math.max(0.8, Math.min(1.4, viewport.zoom));

    return (
        <>
            <defs>
                <pattern
                    id="wispen-grid"
                    width={major}
                    height={major}
                    patternUnits="userSpaceOnUse"
                    patternTransform={`translate(${offsetX} ${offsetY})`}
                >
                    {type === "dots" ? (
                        Array.from({ length: 25 }, (_, i) => (
                            <circle
                                key={i}
                                cx={(i % 5) * cell}
                                cy={Math.floor(i / 5) * cell}
                                r={i === 0 ? dot * 1.4 : dot}
                                className={i === 0 ? "fill-grid-major" : "fill-grid"}
                            />
                        ))
                    ) : (
                        <>
                            <path
                                d={Array.from(
                                    { length: 5 },
                                    (_, i) => `M${i * cell} 0 V${major} M0 ${i * cell} H${major}`,
                                ).join(" ")}
                                className="stroke-grid"
                                strokeWidth={1}
                                fill="none"
                            />
                            <path
                                d={`M0 0 V${major} M0 0 H${major}`}
                                className="stroke-grid-major"
                                strokeWidth={1}
                                fill="none"
                            />
                        </>
                    )}
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#wispen-grid)" />
        </>
    );
}
