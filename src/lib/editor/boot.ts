import { invalidateTextCache } from "@/lib/canvas/text";
import { restoreSession, startAutosave } from "@/lib/storage/persistence";
import { refreshTextLayout } from "@/lib/stores/document";
import { editorStore, hydrateEditor } from "@/lib/stores/editor";

/**
 * Measures text again whenever web fonts finish loading, since earlier measurements used
 * fallback fonts.
 *
 * @returns A function removing the listener
 */
function watchFonts(): () => void {
    const refresh = () => {
        invalidateTextCache();
        refreshTextLayout();
        editorStore.setState((state) => ({ fontsVersion: state.fontsVersion + 1 }));
    };
    void document.fonts.ready.then(refresh);
    document.fonts.addEventListener("loadingdone", refresh);
    return () => document.fonts.removeEventListener("loadingdone", refresh);
}

/**
 * Starts the editor once: preferences, last document, autosave and font watching.
 *
 * @returns A cleanup function stopping the background tasks
 */
export async function bootEditor(): Promise<() => void> {
    hydrateEditor();
    await restoreSession();
    const stopAutosave = startAutosave();
    const stopFonts = watchFonts();
    return () => {
        stopAutosave();
        stopFonts();
    };
}
