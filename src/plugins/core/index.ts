import { coreExporters, coreImporters } from "@/lib/export/formats";
import { diamondShape } from "@/plugins/core/diamond";
import { ellipseShape } from "@/plugins/core/ellipse";
import { freedrawShape } from "@/plugins/core/freedraw";
import { imageShape } from "@/plugins/core/image";
import { arrowShape, lineShape } from "@/plugins/core/linear";
import { rectangleShape } from "@/plugins/core/rectangle";
import { textShape } from "@/plugins/core/text";
import { coreTools } from "@/plugins/core/tools";
import type { WispenPlugin } from "@/types/plugin";

// Built-in shapes, tools and formats, declared through the same API as any other plugin.
export const corePlugin: WispenPlugin = {
    id: "core",
    name: { en: "Core", fr: "Base" },
    shapes: [
        rectangleShape,
        diamondShape,
        ellipseShape,
        arrowShape,
        lineShape,
        freedrawShape,
        textShape,
        imageShape,
    ],
    tools: coreTools,
    exporters: coreExporters,
    importers: coreImporters,
};
