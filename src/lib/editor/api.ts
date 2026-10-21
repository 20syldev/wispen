import { toast } from "sonner";

import { buildElement } from "@/lib/canvas/elements";
import { viewportCenter } from "@/lib/canvas/viewport";
import { selectElements } from "@/lib/editor/actions";
import { getTool } from "@/lib/registry";
import {
    addElements,
    deleteElements,
    documentStore,
    getActivePage,
    getSelectedElements,
    updateElements,
} from "@/lib/stores/document";
import { editorStore, setSelection, setTool } from "@/lib/stores/editor";
import { localeStore } from "@/lib/stores/locale";
import type { EditorApi } from "@/types/plugin";

/**
 * Activates a tool, or runs it right away when it is an action tool (image picker...).
 *
 * @param id - Id of a registered tool; a tool with a run handler runs instead of activating
 */
export function activateTool(id: string): void {
    const tool = getTool(id);
    if (tool?.run) {
        tool.run(editorApi);
        return;
    }
    setTool(id);
}

// Editor API handed to plugin commands and action tools, backed by the document and editor stores.
export const editorApi: EditorApi = {
    getDocument: () => documentStore.getState().document,
    getActivePage,
    getSelectedElements,
    select: (ids) => selectElements(ids),
    createElement: (type, patch) => buildElement(type, editorStore.getState().style, patch),
    addElements: (elements, options) => {
        addElements(elements);
        if (options?.select) setSelection(elements.map((el) => el.id));
    },
    updateElements: (ids, patch) => updateElements(ids, patch),
    deleteElements: (ids) => deleteElements(ids),
    setTool: activateTool,
    getViewportCenter: viewportCenter,
    notify: (message, kind = "info") => {
        if (kind === "success") toast.success(message);
        else if (kind === "error") toast.error(message);
        else toast(message);
    },
    locale: () => localeStore.getState().locale,
};
