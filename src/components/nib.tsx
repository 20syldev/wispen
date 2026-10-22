// Path of the filled nib silhouette.
const BODY =
    "M12 22.6 7.2 14.6C6.2 12.6 6.2 10.4 7.2 8.6 8.2 6.8 8.8 4.6 9.2 2.4h5.6c.4 2.2 1 4.4 2 6.2 1 1.8 1 4 0 6z";

// Path of the outline nib, drawn as a monoline stroke.
const OUTLINE_BODY =
    "M12 21.4 8 14.4C7.2 12.8 7.2 10.8 8 9.2 8.9 7.6 9.5 5.6 9.8 3.6h4.4c.3 2 .9 4 1.8 5.6.8 1.6.8 3.6 0 5.2z";

interface NibProps {
    variant?: "outline" | "solid";
    className?: string;
}

/**
 * The wispen pen nib. The "solid" variant is the filled emblem with the vermilion slit and
 * breather hole; the "outline" variant is a monoline drawing in currentColor that takes the stroke
 * width from its class, so it sits among the lucide icons of the tool dock.
 *
 * @param variant - Drawing to use, outline by default; solid is the filled emblem
 * @param className - Class sizing the svg and, for the outline variant, setting its stroke width
 * @returns The decorative svg, hidden from assistive technologies
 */
export function Nib({ variant = "outline", className }: NibProps) {
    if (variant === "solid") {
        return (
            <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
                <path className="fill-current" d={BODY} />
                <path
                    className="fill-none stroke-mark"
                    strokeWidth={1.3}
                    strokeLinecap="round"
                    d="M12 13V22"
                />
                <circle className="fill-mark" cx="12" cy="9.8" r="1.9" />
            </svg>
        );
    }

    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d={OUTLINE_BODY} />
            <path d="M12 21.4v-9.9" />
            <circle cx="12" cy="9.8" r="1.6" />
        </svg>
    );
}

/**
 * Outline nib typed as a tool icon, for registries that expect a component taking only a class.
 *
 * @param className - Class sizing the svg and setting its stroke width
 * @returns The outline nib
 */
export function NibIcon({ className }: { className?: string }) {
    return <Nib variant="outline" className={className} />;
}
