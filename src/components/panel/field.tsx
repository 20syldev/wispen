import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface FieldProps {
    label: string;
    id: string;
    aside?: ReactNode;
    children: ReactNode;
    className?: string;
}

/**
 * Labelled block of the properties panel: a small muted caption above its control.
 *
 * @param label - Short plain string rendered as is in the span carrying the id, no markup
 * @param id - Id given to the caption, for the control to reference through aria-labelledby
 * @param aside - Optional content aligned to the right of the caption, such as the current value
 * @param children - Control named by the caption, which must reference it through
 * aria-labelledby={id}
 * @param className - Extra classes merged into the block wrapper
 * @returns The caption row followed by the control
 */
export function Field({ label, id, aside, children, className }: FieldProps) {
    return (
        <div className={cn("grid min-w-0 gap-1.5", className)}>
            <div className="flex items-baseline justify-between gap-2 text-[11.5px] leading-tight font-medium text-muted-foreground">
                <span id={id}>{label}</span>
                {aside}
            </div>
            {children}
        </div>
    );
}

/**
 * Hairline separating the groups of the properties panel, bleeding to the panel edges.
 *
 * @returns A decorative rule hidden from assistive technologies
 */
export function FieldSeparator() {
    return <div aria-hidden="true" className="-mx-3.5 my-px h-px bg-border" />;
}
