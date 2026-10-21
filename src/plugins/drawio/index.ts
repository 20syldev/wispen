import type { WispenPlugin } from "@/types/plugin";

import { DRAWIO_MIME, exportDrawio } from "./exporter";

// Export to draw.io (diagrams.net): one diagram per page, shapes and connectors stay editable.
export const drawioPlugin: WispenPlugin = {
    id: "drawio",
    name: "draw.io",
    description: {
        en: "Exports pages as editable draw.io diagrams.",
        fr: "Exporte les pages en diagrammes draw.io modifiables.",
    },
    exporters: [
        {
            id: "drawio",
            label: "draw.io",
            extension: "drawio",
            mimeType: DRAWIO_MIME,
            scopes: ["page", "document"],
            options: [],
            export: exportDrawio,
        },
    ],
};
