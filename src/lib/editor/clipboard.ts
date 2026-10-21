import { insertImages, insertText, pasteElements } from "@/lib/editor/actions";
import { deleteElements, getSelectedElements } from "@/lib/stores/document";
import type { Point, WispenClipboard, WispenElement } from "@/types/scene";

// Fallback when the system clipboard is unavailable (permissions, insecure context).
let memory: WispenElement[] = [];

/**
 * Serializes elements in the clipboard envelope recognized by paste.
 *
 * @param elements - Elements wrapped as they are, with no filtering on their lock state
 * @returns JSON string tagged "wispen/clipboard" that parse reads back
 */
function serialize(elements: WispenElement[]): string {
    const payload: WispenClipboard = { type: "wispen/clipboard", elements };
    return JSON.stringify(payload);
}

/**
 * Parses clipboard text produced by serialize.
 *
 * @param text - Raw clipboard text; anything not starting with "{" is rejected without parsing
 * @returns The elements, or null when the text is not a wispen clipboard
 */
function parse(text: string): WispenElement[] | null {
    if (!text.startsWith("{")) return null;
    try {
        const data = JSON.parse(text) as Partial<WispenClipboard>;
        return data.type === "wispen/clipboard" && Array.isArray(data.elements)
            ? data.elements
            : null;
    } catch {
        return null;
    }
}

/**
 * Copies the selection into a clipboard event, or into the system clipboard when no event is
 * given (context menu), and keeps an in-memory copy as a fallback.
 *
 * @param event - Native copy or cut event, when triggered by the keyboard
 * @returns true when something was copied
 */
export function copySelection(event?: ClipboardEvent): boolean {
    const selected = getSelectedElements();
    if (selected.length === 0) return false;
    memory = selected;
    const text = serialize(selected);
    if (event?.clipboardData) {
        event.clipboardData.setData("text/plain", text);
        event.preventDefault();
    } else {
        void navigator.clipboard?.writeText(text).catch(() => undefined);
    }
    return true;
}

/**
 * Copies then deletes the unlocked part of the selection.
 *
 * @param event - Native cut event, when triggered by the keyboard
 */
export function cutSelection(event?: ClipboardEvent): void {
    if (!copySelection(event)) return;
    deleteElements(
        getSelectedElements()
            .filter((el) => !el.locked)
            .map((el) => el.id),
    );
}

/**
 * Pastes from a clipboard event: wispen elements, then pictures, then plain text.
 *
 * @param event - Native paste event
 * @returns true when the clipboard held something usable
 */
export function pasteFromEvent(event: ClipboardEvent): boolean {
    const data = event.clipboardData;
    if (!data) return false;

    const elements = parse(data.getData("text/plain"));
    if (elements) {
        pasteElements(elements);
        return true;
    }

    const images = Array.from(data.files).filter((file) => file.type.startsWith("image/"));
    if (images.length > 0) {
        void insertImages(images);
        return true;
    }

    const text = data.getData("text/plain");
    if (text.trim()) {
        insertText(text);
        return true;
    }
    return false;
}

/**
 * Pastes from the system clipboard API, used by the context menu where no paste event exists.
 * Falls back to the in-memory copy when reading is denied.
 *
 * @param at - Scene point to center the pasted content on, such as the right-click position;
 * defaults to the usual placement
 * @returns true when something was pasted
 */
export async function pasteFromClipboard(at?: Point): Promise<boolean> {
    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            const imageType = item.types.find((type) => type.startsWith("image/"));
            if (imageType) {
                await insertImages([await item.getType(imageType)], at);
                return true;
            }
            if (item.types.includes("text/plain")) {
                const text = await (await item.getType("text/plain")).text();
                const elements = parse(text);
                if (elements) pasteElements(elements, at);
                else insertText(text, at);
                return Boolean(elements) || text.trim().length > 0;
            }
        }
    } catch {
        if (memory.length > 0) {
            pasteElements(memory, at);
            return true;
        }
    }
    return false;
}
