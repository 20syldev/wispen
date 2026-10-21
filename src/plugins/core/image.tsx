import { cornerRadius, dashArray } from "@/lib/canvas/render";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";

/**
 * Embedded picture clipped to the rounded bounds, with an optional border.
 *
 * @param element - Picture read for its bounds, source, corner radius and border; the border is
 * skipped when transparent or of zero width
 * @param ctx - Render services resolving the border color
 */
function Picture({ element, ctx }: ShapeProps) {
    const radius = cornerRadius(element);
    const clipId = `clip-${element.id}`;
    return (
        <>
            <defs>
                <clipPath id={clipId}>
                    <rect
                        x={element.x}
                        y={element.y}
                        width={element.width}
                        height={element.height}
                        rx={radius}
                        ry={radius}
                    />
                </clipPath>
            </defs>
            <image
                href={element.src}
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                preserveAspectRatio="none"
                clipPath={`url(#${clipId})`}
            />
            {element.strokeColor !== "transparent" && element.strokeWidth > 0 && (
                <rect
                    x={element.x}
                    y={element.y}
                    width={element.width}
                    height={element.height}
                    rx={radius}
                    ry={radius}
                    fill="none"
                    stroke={ctx.color(element.strokeColor, "stroke")}
                    strokeWidth={element.strokeWidth}
                    strokeDasharray={dashArray(element)}
                />
            )}
        </>
    );
}

export const imageShape: ShapeDefinition = {
    type: "image",
    label: { en: "Image", fr: "Image" },
    kind: "box",
    radius: true,
    keepAspectRatio: true,
    bindable: true,
    defaults: { strokeColor: "transparent", fillColor: "transparent" },
    Component: Picture,
};
