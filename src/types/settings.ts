export const LOCALES = [
    { id: "en", label: "English" },
    { id: "fr", label: "Français" },
] as const;

export type Locale = (typeof LOCALES)[number]["id"];

// Served at the site root; the others live under their own prefix, such as /fr/.
export const DEFAULT_LOCALE: Locale = "en";

export type GridType = "dots" | "lines";

export type ThemeName = "light" | "dark";

export type CanvasStyle = "white" | "tinted";

export interface Settings {
    showGrid: boolean;
    snapToGrid: boolean;
    gridType: GridType;
    gridSize: number;
    canvas: CanvasStyle;
}

export const DEFAULT_SETTINGS: Settings = {
    showGrid: true,
    snapToGrid: false,
    gridType: "dots",
    gridSize: 20,
    canvas: "white",
};

// Keys of everything the app writes to localStorage, prefixed to avoid collisions.
export const STORAGE_KEYS = {
    locale: "wispen:locale",
    settings: "wispen:settings",
    lastDocument: "wispen:last-document",
    style: "wispen:style",
} as const;
