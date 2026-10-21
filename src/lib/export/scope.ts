import { safeFilename } from "@/lib/storage/download";
import type { ExportScope } from "@/types/plugin";
import type { Page, WispenDocument } from "@/types/scene";

/**
 * Returns the page displayed in the editor.
 *
 * @param document - Current document; its pages must be non-empty, as pages[0] is the fallback
 * @returns The active page, or the first one when the active id is stale
 */
export function activePage(document: WispenDocument): Page {
    return document.pages.find((page) => page.id === document.activePageId) ?? document.pages[0];
}

/**
 * Collects the pages covered by an export scope, as expected by ExportInput.pages.
 *
 * @param document - Current document, of which pages and activePageId are read
 * @param selectedIds - Selected element ids; ids missing from the active page are ignored
 * @param scope - "selection" gives one page holding the selected elements, "page" the active
 * page and "document" every page
 * @returns Pages with their elements, bottom to top
 */
export function scopePages(
    document: WispenDocument,
    selectedIds: string[],
    scope: ExportScope,
): Page[] {
    if (scope === "document") return document.pages;
    const page = activePage(document);
    if (scope === "page") return [page];
    const selected = new Set(selectedIds);
    return [{ ...page, elements: page.elements.filter((element) => selected.has(element.id)) }];
}

/**
 * Suggests a file name, without extension, for an export.
 *
 * @param document - Current document, read for its name and active page
 * @param scope - Page exports append the page name to the document name
 * @returns A name safe on every operating system
 */
export function defaultFilename(document: WispenDocument, scope: ExportScope): string {
    if (scope !== "page") return safeFilename(document.name);
    return safeFilename(`${document.name} - ${activePage(document).name}`);
}
