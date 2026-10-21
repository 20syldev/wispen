import type { WispenPlugin } from "@/types/plugin";

import { EXCALIDRAW_MIME, exportExcalidraw } from "./exporter";
import { documentName, isExcalidrawScene, parseExcalidraw } from "./importer";

/**
 * Two-way bridge with excalidraw.com: opens .excalidraw files as new documents and exports a
 * page or the selection as a .excalidraw file.
 */
export const excalidrawPlugin: WispenPlugin = {
    id: "excalidraw",
    name: "Excalidraw",
    description: {
        en: "Opens and exports .excalidraw files.",
        fr: "Ouvre et exporte les fichiers .excalidraw.",
    },
    exporters: [
        {
            id: "excalidraw",
            label: "Excalidraw",
            extension: "excalidraw",
            mimeType: EXCALIDRAW_MIME,
            scopes: ["page", "selection"],
            options: [],
            export: exportExcalidraw,
        },
    ],
    importers: [
        {
            id: "excalidraw",
            label: "Excalidraw",
            accept: [".excalidraw", EXCALIDRAW_MIME],
            match: (_file, text) => isExcalidrawScene(text),
            import: async (file, text) => ({
                kind: "document",
                document: parseExcalidraw(text, documentName(file.name)),
            }),
        },
    ],
};
