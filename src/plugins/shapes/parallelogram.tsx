import { cn } from "@/lib/utils";

/**
 * Parallelogram tool icon drawn like the lucide set (24px grid, 2px rounded stroke in the
 * current color), since lucide has no parallelogram.
 *
 * @param className - Classes merged after the lucide defaults, usually a size utility
 * @returns The decorative SVG icon, hidden from assistive technologies
 */
export function ParallelogramIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn("lucide", className)}
        >
            <path d="M7 5h15l-5 14H2Z" />
        </svg>
    );
}
