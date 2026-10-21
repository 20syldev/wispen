import { createStore } from "@/lib/store";
import { documentStore, getSelectedElements } from "@/lib/stores/document";
import { DEFAULT_STYLE, editorStore } from "@/lib/stores/editor";
import type { WispenElement } from "@/types/scene";

// Most recent custom colors kept for the color picker, newest first.
const RECENT_LIMIT = 8;

// Element properties the panel depends on, none of which a move or resize changes.
const PANEL_FIELDS = [
    ...Object.keys(DEFAULT_STYLE),
    "type",
    "text",
    "locked",
    "groupId",
] as (keyof WispenElement)[];

// Shared empty selection, so that an empty panel selection keeps a stable reference.
const NO_ELEMENTS: WispenElement[] = [];

// Last selection handed to the panel, with the panel fields it was built from.
let selectionCache = { key: "", elements: NO_ELEMENTS };

export interface PanelState {
    open: boolean;
    recentColors: string[];
}

/**
 * Holds the visibility of the properties panel on small screens and the recent custom colors.
 */
export const panelStore = createStore<PanelState>({ open: false, recentColors: [] });

/**
 * Shows or hides the properties panel on small screens.
 *
 * @param open - true to show the panel as a floating sheet
 */
export function setPanelOpen(open: boolean): void {
    if (panelStore.getState().open !== open) panelStore.setState({ open });
}

/**
 * Flips the visibility of the properties panel on small screens.
 */
export function togglePanel(): void {
    setPanelOpen(!panelStore.getState().open);
}

/**
 * Remembers a custom color for the rest of the session, moving it first when already known.
 *
 * @param color - Color as "#rrggbb"; other formats are ignored
 */
export function addRecentColor(color: string): void {
    if (!/^#[0-9a-f]{6}$/.test(color)) return;
    const others = panelStore.getState().recentColors.filter((entry) => entry !== color);
    panelStore.setState({ recentColors: [color, ...others].slice(0, RECENT_LIMIT) });
}

/**
 * Subscribes to the two stores the selection of the panel derives from, for
 * useSyncExternalStore.
 *
 * @param listener - Called after every change of the document or of the editor state
 * @returns A function removing the listener from both stores
 */
export function subscribePanelSelection(listener: () => void): () => void {
    const offDocument = documentStore.subscribe(listener);
    const offEditor = editorStore.subscribe(listener);
    return () => {
        offDocument();
        offEditor();
    };
}

/**
 * Returns the selected elements as the properties panel sees them. The array stays the same
 * while only properties the panel ignores change, so dragging or resizing the selection does
 * not re-render the panel on every pointer move; its elements may then carry stale positions.
 *
 * @returns The selection in page order, a new array only when a panel field or the selection
 * itself changed
 */
export function getPanelSelection(): WispenElement[] {
    const elements = getSelectedElements();
    const key = elements
        .map((element) => element.id + JSON.stringify(PANEL_FIELDS.map((field) => element[field])))
        .join("\n");
    if (key !== selectionCache.key) {
        selectionCache = { key, elements: elements.length > 0 ? elements : NO_ELEMENTS };
    }
    return selectionCache.elements;
}

/**
 * Selection used while rendering on the server and hydrating, where nothing is selected yet.
 *
 * @returns A shared empty array
 */
export function getServerPanelSelection(): WispenElement[] {
    return NO_ELEMENTS;
}
