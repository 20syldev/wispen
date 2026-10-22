import { Command } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Prints the label of a key cap, drawing the Apple Command key with the icon library instead of
 * a Unicode glyph. The text stays available to screen readers.
 *
 * @param label - Label from formatShortcut, "Cmd" on Apple platforms
 * @param children - Text printed for any other key; defaults to the label
 * @returns The icon for Cmd, the text otherwise
 */
export function KeyLabel({ label, children = label }: { label: string; children?: ReactNode }) {
    if (label !== "Cmd") return <>{children}</>;
    return (
        <>
            <Command aria-hidden="true" strokeWidth={2} />
            <span className="sr-only">{label}</span>
        </>
    );
}
