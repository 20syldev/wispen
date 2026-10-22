import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Floating panel of the editor chrome (toolbar, properties, page tabs...), styled once here so
 * every island shares the same surface, border, radius and shadow tokens.
 *
 * @param className - Classes merged after the island surface, so a caller can override it
 * @param props - Other div props, forwarded to the surface
 * @returns The island surface wrapping its children
 */
export function Island({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "pointer-events-auto rounded-island border border-border/70 bg-card/95 text-card-foreground shadow-island backdrop-blur-md",
                className,
            )}
            {...props}
        />
    );
}
