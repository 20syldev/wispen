import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, resolving conflicting Tailwind utilities in favour of the last one.
 *
 * @param inputs - Class values accepted by clsx (strings, arrays, conditional objects)
 * @returns The merged class string
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
