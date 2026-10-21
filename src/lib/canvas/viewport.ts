import { drawnBounds } from "@/lib/canvas/elements";
import { screenToScene, unionBounds } from "@/lib/canvas/geometry";
import { getActivePage, getSelectedElements } from "@/lib/stores/document";
import { editorStore, getViewport, MAX_ZOOM, MIN_ZOOM, setViewport } from "@/lib/stores/editor";
import type { Bounds, Point, Viewport } from "@/types/scene";

/**
 * Returns the viewport of the active page.
 *
 * @returns Current pan and zoom
 */
export function currentViewport(): Viewport {
    return getViewport(getActivePage().id);
}

/**
 * Replaces the viewport of the active page.
 *
 * @param viewport - New pan and zoom
 */
export function setCurrentViewport(viewport: Viewport): void {
    setViewport(getActivePage().id, viewport);
}

/**
 * Returns the center of the visible area in scene coordinates.
 *
 * @returns The scene point at the middle of the canvas
 */
export function viewportCenter(): Point {
    const { width, height } = editorStore.getState().canvasSize;
    return screenToScene({ x: width / 2, y: height / 2 }, currentViewport());
}

/**
 * Zooms around a screen point, which stays under the cursor.
 *
 * @param zoom - Target zoom, clamped to the supported range
 * @param anchor - Screen point kept in place; defaults to the canvas center
 */
export function zoomTo(zoom: number, anchor?: Point): void {
    const viewport = currentViewport();
    const { width, height } = editorStore.getState().canvasSize;
    const at = anchor ?? { x: width / 2, y: height / 2 };
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    const scene = screenToScene(at, viewport);
    setCurrentViewport({ x: at.x - scene.x * next, y: at.y - scene.y * next, zoom: next });
}

/**
 * Multiplies the zoom by a factor around a screen point.
 *
 * @param factor - Multiplier, above 1 to zoom in
 * @param anchor - Screen point kept in place; defaults to the canvas center
 */
export function zoomBy(factor: number, anchor?: Point): void {
    zoomTo(currentViewport().zoom * factor, anchor);
}

/**
 * Pans and zooms so that bounds fill the canvas with a margin, without zooming past 100 %.
 *
 * @param bounds - Area to show, in scene coordinates
 */
export function fitBounds(bounds: Bounds): void {
    const { width, height } = editorStore.getState().canvasSize;
    if (width === 0 || height === 0) return;
    const margin = 80;
    const zoom = Math.min(
        1,
        MAX_ZOOM,
        Math.max(
            MIN_ZOOM,
            Math.min(
                (width - margin * 2) / Math.max(bounds.width, 1),
                (height - margin * 2) / Math.max(bounds.height, 1),
            ),
        ),
    );
    setCurrentViewport({
        x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
        y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
        zoom,
    });
}

/**
 * Fits every element of the active page, or resets the view on an empty page.
 */
export function zoomToFit(): void {
    const bounds = unionBounds(getActivePage().elements.map(drawnBounds));
    if (bounds) fitBounds(bounds);
    else setCurrentViewport({ x: 0, y: 0, zoom: 1 });
}

/**
 * Fits the selection, or every element when nothing is selected.
 */
export function zoomToSelection(): void {
    const bounds = unionBounds(getSelectedElements().map(drawnBounds));
    if (bounds) fitBounds(bounds);
    else zoomToFit();
}
