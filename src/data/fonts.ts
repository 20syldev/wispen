export type FontCategory = "sans" | "serif" | "mono" | "handwriting" | "display";

export interface FontEntry {
    id: string;
    label: string;
    category: FontCategory;
    variable: string;
    fallback: string;
}

// Fonts offered for canvas text; loading happens in app/fonts.ts, keep both lists in sync.
export const FONTS: FontEntry[] = [
    {
        id: "geist",
        label: "Geist",
        category: "sans",
        variable: "--font-geist",
        fallback: "sans-serif",
    },
    {
        id: "nunito",
        label: "Nunito",
        category: "sans",
        variable: "--font-nunito",
        fallback: "sans-serif",
    },
    {
        id: "inter",
        label: "Inter",
        category: "sans",
        variable: "--font-inter",
        fallback: "sans-serif",
    },
    {
        id: "space-grotesk",
        label: "Space Grotesk",
        category: "sans",
        variable: "--font-space-grotesk",
        fallback: "sans-serif",
    },
    {
        id: "bricolage",
        label: "Bricolage Grotesque",
        category: "display",
        variable: "--font-bricolage",
        fallback: "sans-serif",
    },
    {
        id: "bebas-neue",
        label: "Bebas Neue",
        category: "display",
        variable: "--font-bebas-neue",
        fallback: "sans-serif",
    },
    {
        id: "playfair",
        label: "Playfair Display",
        category: "serif",
        variable: "--font-playfair",
        fallback: "serif",
    },
    {
        id: "instrument-serif",
        label: "Instrument Serif",
        category: "serif",
        variable: "--font-instrument-serif",
        fallback: "serif",
    },
    { id: "lora", label: "Lora", category: "serif", variable: "--font-lora", fallback: "serif" },
    {
        id: "jetbrains-mono",
        label: "JetBrains Mono",
        category: "mono",
        variable: "--font-jetbrains-mono",
        fallback: "monospace",
    },
    {
        id: "caveat",
        label: "Caveat",
        category: "handwriting",
        variable: "--font-caveat",
        fallback: "cursive",
    },
    {
        id: "patrick-hand",
        label: "Patrick Hand",
        category: "handwriting",
        variable: "--font-patrick-hand",
        fallback: "cursive",
    },
    {
        id: "architects-daughter",
        label: "Architects Daughter",
        category: "handwriting",
        variable: "--font-architects-daughter",
        fallback: "cursive",
    },
    {
        id: "permanent-marker",
        label: "Permanent Marker",
        category: "display",
        variable: "--font-permanent-marker",
        fallback: "cursive",
    },
    {
        id: "comic-neue",
        label: "Comic Neue",
        category: "handwriting",
        variable: "--font-comic-neue",
        fallback: "cursive",
    },
    {
        id: "pacifico",
        label: "Pacifico",
        category: "display",
        variable: "--font-pacifico",
        fallback: "cursive",
    },
];

export const DEFAULT_FONT = "geist";

// Size presets of the properties panel, in scene pixels.
export const FONT_SIZES = [
    { id: "s", value: 16 },
    { id: "m", value: 20 },
    { id: "l", value: 28 },
    { id: "xl", value: 40 },
] as const;

/**
 * Looks a font up by id, falling back to the default font for unknown ids.
 *
 * @param id - Font id stored on an element, possibly from a removed plugin or a newer version
 * @returns The catalog entry
 */
export function getFont(id: string): FontEntry {
    return FONTS.find((font) => font.id === id) ?? FONTS[0];
}
