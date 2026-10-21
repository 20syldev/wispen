import { toast } from "sonner";

import { zoomToFit } from "@/lib/canvas/viewport";
import { insertImages, pasteElements } from "@/lib/editor/actions";
import { getTranslator } from "@/lib/i18n";
import { createId } from "@/lib/id";
import { getImporters } from "@/lib/registry";
import { loadDocument } from "@/lib/stores/document";
import type { Point } from "@/types/scene";

/**
 * Imports files dropped or picked by the user: pictures become image elements, other files go
 * to the first importer that recognizes them. Imported documents open as new local documents,
 * imported elements land on the active page.
 *
 * @param files - Pictures are inserted first, then the other files are tried in order against the
 *     importers; a failing file is reported and skipped
 * @param at - Scene point to place pictures and elements at; defaults to the visible center
 */
export async function importFiles(files: File[], at?: Point): Promise<void> {
    const t = getTranslator("common");
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length > 0) await insertImages(images, at);

    for (const file of files.filter((f) => !f.type.startsWith("image/"))) {
        try {
            const text = await file.text();
            const importer = getImporters().find((candidate) => candidate.match(file, text));
            if (!importer) {
                toast.error(t("importError", { name: file.name }));
                continue;
            }
            const result = await importer.import(file, text);
            if (result.kind === "elements") {
                pasteElements(result.elements, at);
            } else {
                loadDocument({ ...result.document, id: createId(), updatedAt: Date.now() });
                zoomToFit();
                toast.success(t("imported", { name: result.document.name }));
            }
        } catch {
            toast.error(t("importFailed", { name: file.name }));
        }
    }
}
