import { DEFAULT_FONT } from "@/data/fonts";
import { createStore } from "@/lib/store";
import type { Bounds, Viewport, WispenElement } from "@/types/scene";
import { DEFAULT_SETTINGS, type Settings, STORAGE_KEYS } from "@/types/settings";

export type StyleDefaults = Pick<
    WispenElement,
    | "strokeColor"
    | "fillColor"
    | "strokeWidth"
    | "strokeStyle"
    | "opacity"
    | "radius"
    | "textColor"
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "fontStyle"
    | "textDecoration"
    | "textAlign"
    | "verticalAlign"
> &
    Required<Pick<WispenElement, "startArrowhead" | "endArrowhead" | "routing">>;

// Style given to new elements until the user changes it.
export const DEFAULT_STYLE: StyleDefaults = {
    strokeColor: "ink",
    fillColor: "transparent",
    strokeWidth: 2,
    strokeStyle: "solid",
    opacity: 100,
    radius: 12,
    textColor: "ink",
    fontFamily: DEFAULT_FONT,
    fontSize: 20,
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "center",
    verticalAlign: "middle",
    startArrowhead: "none",
    endArrowhead: "arrow",
    routing: "straight",
};

export type DialogName = "export" | "documents" | "shortcuts" | "palette";

export type CursorName =
    | "default"
    | "crosshair"
    | "grab"
    | "grabbing"
    | "move"
    | "text"
    | "pointer"
    | "ew-resize"
    | "ns-resize"
    | "nwse-resize"
    | "nesw-resize";

export interface EditorState {
    tool: string;
    toolLocked: boolean;
    selectedIds: string[];
    editingId: string | null;
    viewports: Record<string, Viewport>;
    style: StyleDefaults;
    settings: Settings;
    dialog: DialogName | null;
    marquee: Bounds | null;
    bindingTargetId: string | null;
    erasingIds: string[];
    cursor: CursorName;
    fontsVersion: number;
    canvasSize: { width: number; height: number };
}

// Pan and zoom of a page never displayed.
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

// Lowest zoom accepted by setViewport.
export const MIN_ZOOM = 0.1;

// Highest zoom accepted by setViewport.
export const MAX_ZOOM = 8;

/**
 * Holds the transient editor state: active tool, selection, per-page viewports, style defaults,
 * persisted settings, open dialog and canvas interaction feedback.
 */
export const editorStore = createStore<EditorState>({
    tool: "select",
    toolLocked: false,
    selectedIds: [],
    editingId: null,
    viewports: {},
    style: DEFAULT_STYLE,
    settings: DEFAULT_SETTINGS,
    dialog: null,
    marquee: null,
    bindingTargetId: null,
    erasingIds: [],
    cursor: "default",
    fontsVersion: 0,
    canvasSize: { width: 0, height: 0 },
});

/**
 * Reads a JSON value from localStorage, ignoring missing keys, invalid JSON and blocked storage.
 *
 * @param key - One of the STORAGE_KEYS values, prefixed with "wispen:"
 * @returns The parsed value, or null when unavailable
 */
function readJson(key: string): unknown {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Writes a JSON value to localStorage, silently ignoring quota or privacy-mode failures since
 * preferences are not worth interrupting the user for.
 *
 * @param key - One of the STORAGE_KEYS values, prefixed with "wispen:"
 * @param value - Value to store, replacing the previous one; it must survive JSON.stringify
 */
function writeJson(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Preferences are best effort
    }
}

/**
 * Restores persisted settings and style defaults; unknown or missing fields keep their defaults.
 */
export function hydrateEditor(): void {
    const settings = readJson(STORAGE_KEYS.settings);
    const style = readJson(STORAGE_KEYS.style);
    editorStore.setState({
        settings: {
            ...DEFAULT_SETTINGS,
            ...(settings && typeof settings === "object" ? settings : {}),
        },
        style: { ...DEFAULT_STYLE, ...(style && typeof style === "object" ? style : {}) },
    });
    applyAppearance(editorStore.getState().settings);
}

/**
 * Updates grid, snapping and appearance preferences and persists them.
 *
 * @param patch - Only the given fields change; the merged settings object is persisted whole
 */
export function updateSettings(patch: Partial<Settings>): void {
    const settings = { ...editorStore.getState().settings, ...patch };
    editorStore.setState({ settings });
    writeJson(STORAGE_KEYS.settings, settings);
    applyAppearance(settings);
}

/**
 * Reflects the canvas style on <html>, where globals.css reads it; the white canvas removes the
 * attribute.
 *
 * @param settings - Preferences read for the canvas style
 */
function applyAppearance(settings: Settings): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (settings.canvas === "tinted") root.dataset.canvas = "tinted";
    else delete root.dataset.canvas;
}

/**
 * Updates the style applied to new elements and persists it.
 *
 * @param patch - Properties merged over the current defaults; the merged style is persisted whole
 */
export function updateStyle(patch: Partial<StyleDefaults>): void {
    const style = { ...editorStore.getState().style, ...patch };
    editorStore.setState({ style });
    writeJson(STORAGE_KEYS.style, style);
}

/**
 * Activates a tool, leaving text editing and clearing the selection for creation tools.
 *
 * @param tool - Id of a registered tool; "select" and "hand" keep the current selection
 */
export function setTool(tool: string): void {
    const keepSelection = tool === "select" || tool === "hand";
    editorStore.setState((state) => ({
        tool,
        editingId: null,
        selectedIds: keepSelection ? state.selectedIds : [],
        cursor: "default",
    }));
}

/**
 * Replaces the selection.
 *
 * @param ids - Element ids, in any order
 */
export function setSelection(ids: string[]): void {
    editorStore.setState({ selectedIds: ids });
}

/**
 * Opens a dialog, or closes the current one with null.
 *
 * @param dialog - Dialog to show, or null to close the open one and show none
 */
export function openDialog(dialog: DialogName | null): void {
    editorStore.setState({ dialog });
}

/**
 * Returns the viewport of a page, or the default one for a page never displayed.
 *
 * @param pageId - Id of the page; pages never displayed get DEFAULT_VIEWPORT
 * @returns Pan and zoom of the page, zoom already clamped by setViewport
 */
export function getViewport(pageId: string): Viewport {
    return editorStore.getState().viewports[pageId] ?? DEFAULT_VIEWPORT;
}

/**
 * Stores the viewport of a page, clamping the zoom to the supported range.
 *
 * @param pageId - Id of the page whose viewport is replaced
 * @param viewport - New pan and zoom
 */
export function setViewport(pageId: string, viewport: Viewport): void {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom));
    editorStore.setState((state) => ({
        viewports: { ...state.viewports, [pageId]: { ...viewport, zoom } },
    }));
}
