import {
    FILE_EXTENSION,
    FILE_MIME,
    isWispenFile,
    parseDocumentFile,
    serializeDocument,
} from "@/lib/storage/serialization";
import type { ExporterDefinition, ExportInput, ImporterDefinition } from "@/types/plugin";
import type { WispenElement } from "@/types/scene";

/**
 * Returns the elements of the first exported page; image formats hold a single page.
 *
 * @param input - Export input; only its first page is read
 * @returns The elements, empty when no page was given
 */
function firstPageElements(input: ExportInput): WispenElement[] {
    return input.pages[0]?.elements ?? [];
}

/**
 * Built-in export formats. Rendering code is imported on demand: this module is loaded with the
 * plugin registry at startup and must stay light and free of side effects. The .wispen
 * constants are read through getters because the serialization module imports the registry,
 * which imports this module: they may not be initialized when this array is built.
 */
export const coreExporters: ExporterDefinition[] = [
    {
        id: "png",
        label: { en: "PNG image", fr: "Image PNG" },
        extension: "png",
        mimeType: "image/png",
        scopes: ["selection", "page"],
        options: ["background", "theme", "scale", "padding"],
        export: async (input) => {
            const { renderPng } = await import("@/lib/export/pipeline");
            return renderPng(firstPageElements(input), input.options);
        },
    },
    {
        id: "svg",
        label: { en: "SVG image", fr: "Image SVG" },
        extension: "svg",
        mimeType: "image/svg+xml",
        scopes: ["selection", "page"],
        options: ["background", "theme", "padding", "embedFonts"],
        export: async (input) => {
            const { renderSvgFile } = await import("@/lib/export/pipeline");
            return renderSvgFile(firstPageElements(input), input.options);
        },
    },
    {
        id: "pdf",
        label: { en: "PDF document", fr: "Document PDF" },
        extension: "pdf",
        mimeType: "application/pdf",
        scopes: ["selection", "page", "document"],
        options: ["background", "theme", "padding"],
        export: async (input) => {
            const { renderPdf } = await import("@/lib/export/pdf");
            return renderPdf(input);
        },
    },
    {
        id: "wispen",
        label: { en: "Wispen file", fr: "Fichier wispen" },
        get extension() {
            return FILE_EXTENSION;
        },
        get mimeType() {
            return FILE_MIME;
        },
        scopes: ["document"],
        options: [],
        export: async (input) => {
            const document = { ...input.document, pages: input.pages };
            return new Blob([serializeDocument(document)], { type: FILE_MIME });
        },
    },
];

// Built-in import formats: .wispen files, also recognized under a .json name.
export const coreImporters: ImporterDefinition[] = [
    {
        id: "wispen",
        label: { en: "Wispen file", fr: "Fichier wispen" },
        get accept() {
            return [`.${FILE_EXTENSION}`, ".json", FILE_MIME, "application/json"];
        },
        match: (_file, text) => isWispenFile(text),
        import: async (_file, text) => ({ kind: "document", document: parseDocumentFile(text) }),
    },
];
