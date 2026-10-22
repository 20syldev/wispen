"use client";

import { useMemo } from "react";

import { useStore } from "@/hooks/useStore";
import { documentStore } from "@/lib/stores/document";
import { DEFAULT_VIEWPORT, editorStore } from "@/lib/stores/editor";
import type { Page, Viewport, WispenElement } from "@/types/scene";

/**
 * Subscribes to the page currently displayed.
 *
 * @returns The active page, falling back to the first page when the active id is stale
 */
export function useActivePage(): Page {
    return useStore(
        documentStore,
        (state) =>
            state.document.pages.find((page) => page.id === state.document.activePageId) ??
            state.document.pages[0],
    );
}

/**
 * Subscribes to the viewport of the active page.
 *
 * @returns Current pan and zoom
 */
export function useViewport(): Viewport {
    const pageId = useActivePage().id;
    return useStore(editorStore, (state) => state.viewports[pageId] ?? DEFAULT_VIEWPORT);
}

/**
 * Subscribes to the selected elements of the active page.
 *
 * @returns The selection in page order, without stale ids
 */
export function useSelectedElements(): WispenElement[] {
    const page = useActivePage();
    const selectedIds = useStore(editorStore, (state) => state.selectedIds);
    return useMemo(() => {
        const wanted = new Set(selectedIds);
        return page.elements.filter((el) => wanted.has(el.id));
    }, [page, selectedIds]);
}
