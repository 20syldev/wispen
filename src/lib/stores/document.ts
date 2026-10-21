import { refreshBindings } from "@/lib/canvas/binding";
import { finalizeElement, patchElement } from "@/lib/canvas/elements";
import { getTranslator } from "@/lib/i18n";
import { createId } from "@/lib/id";
import { createStore } from "@/lib/store";
import { editorStore } from "@/lib/stores/editor";
import type { ElementPatch } from "@/types/plugin";
import type { Page, WispenDocument, WispenElement } from "@/types/scene";

interface Snapshot {
    pages: Page[];
    activePageId: string;
}

export interface DocumentState {
    document: WispenDocument;
    past: Snapshot[];
    future: Snapshot[];
    revision: number;
}

export interface HistoryMark {
    past: readonly Snapshot[];
    future: readonly Snapshot[];
}

export interface MutationOptions {
    record?: boolean;
    mergeKey?: string;
}

// Maximum number of undo steps kept.
const HISTORY_LIMIT = 100;

// Delay, in milliseconds, within which changes sharing a merge key form one undo step.
const MERGE_WINDOW = 1000;

// Merge key and time of the latest checkpoint, to fold a burst of changes into one undo step.
let lastMerge: { key: string; at: number } | null = null;

/**
 * Creates an empty page.
 *
 * @param name - Page name shown in the tabs
 * @returns The page, without elements
 */
export function createPage(name: string): Page {
    return { id: createId(), name, elements: [] };
}

/**
 * Creates a document with one empty page.
 *
 * @param name - Document name, localized by the caller like pageName
 * @param pageName - Name of the first page, localized by the caller
 * @returns The new document, made of the first page only, which is the active one
 */
export function createDocument(name: string, pageName: string): WispenDocument {
    const page = createPage(pageName);
    const now = Date.now();
    return {
        id: createId(),
        name,
        createdAt: now,
        updatedAt: now,
        pages: [page],
        activePageId: page.id,
    };
}

/**
 * Translates keys of the common catalog.
 * Bound to the locale active when the module loads, it names the initial document and page.
 *
 * @param key - Message key within the common namespace
 * @param values - Interpolation values of the message, such as the page number
 * @returns The message in the locale active at load time
 */
const t = getTranslator("common");

/**
 * Holds the open document with its undo and redo stacks. The revision counter grows with every
 * change of the document, so subscribers can tell a new version from a re-render.
 */
export const documentStore = createStore<DocumentState>({
    document: createDocument(t("untitled"), t("pageName", { number: 1 })),
    past: [],
    future: [],
    revision: 0,
});

/**
 * Returns the page currently displayed, falling back to the first page when the active id is
 * stale.
 *
 * @returns The page matching activePageId, or the first page when that id is stale
 */
export function getActivePage(): Page {
    const { document } = documentStore.getState();
    return document.pages.find((page) => page.id === document.activePageId) ?? document.pages[0];
}

/**
 * Returns the elements of the active page.
 *
 * @returns Elements, bottom to top
 */
export function getElements(): WispenElement[] {
    return getActivePage().elements;
}

/**
 * Returns the selected elements of the active page, in page order.
 *
 * @returns The selection, without stale ids
 */
export function getSelectedElements(): WispenElement[] {
    const selected = new Set(editorStore.getState().selectedIds);
    return getElements().filter((el) => selected.has(el.id));
}

/**
 * Pushes the current pages on the undo stack and clears the redo stack.
 *
 * @param mergeKey - Skips the push when the previous checkpoint used the same key less than a
 * second ago, so a burst of small changes undoes at once
 */
export function checkpoint(mergeKey?: string): void {
    const now = Date.now();
    if (mergeKey && lastMerge && lastMerge.key === mergeKey && now - lastMerge.at < MERGE_WINDOW) {
        lastMerge.at = now;
        return;
    }
    lastMerge = mergeKey ? { key: mergeKey, at: now } : null;

    const { document, past } = documentStore.getState();
    const snapshot = { pages: document.pages, activePageId: document.activePageId };
    documentStore.setState({ past: [...past, snapshot].slice(-HISTORY_LIMIT), future: [] });
}

/**
 * Replaces the document and bumps the revision.
 *
 * @param document - Document to publish; its updatedAt is overwritten with the current time
 */
function commit(document: WispenDocument): void {
    documentStore.setState((state) => ({
        document: { ...document, updatedAt: Date.now() },
        revision: state.revision + 1,
    }));
}

/**
 * Records an undo step unless told otherwise.
 *
 * @param options - Mutation options of the caller; record: false skips the step, mergeKey is
 * handed to checkpoint
 */
function record(options: MutationOptions | undefined): void {
    if (options?.record === false) return;
    checkpoint(options?.mergeKey);
}

/**
 * Tells whether an update left the elements of a page as they were: same order and, for each
 * element, the same object or a copy with equal fields.
 *
 * @param before - Elements before the update
 * @param after - Elements returned by the update
 * @returns true when nothing changed, so no undo step nor revision is needed
 */
function sameElements(before: WispenElement[], after: WispenElement[]): boolean {
    if (before === after) return true;
    if (before.length !== after.length) return false;
    return before.every((el, i) => {
        const next = after[i];
        if (el === next) return true;
        const keys = Object.keys(next) as (keyof WispenElement)[];
        return (
            keys.length === Object.keys(el).length &&
            keys.every((key) => Object.is(el[key], next[key]))
        );
    });
}

/**
 * Rewrites the elements of a page, then keeps bound arrows attached to what moved. Updates
 * that change nothing record no undo step.
 *
 * @param update - Receives the current elements and returns the next ones
 * @param changed - Ids of the elements created or modified, to limit the binding refresh
 * @param options - record: false skips the undo step, mergeKey merges a burst into one step
 * @param pageId - Page to change, the active page by default
 */
export function mutateElements(
    update: (elements: WispenElement[]) => WispenElement[],
    changed?: Set<string>,
    options?: MutationOptions,
    pageId?: string,
): void {
    const { document } = documentStore.getState();
    const targetId = pageId ?? getActivePage().id;
    const page = document.pages.find((p) => p.id === targetId);
    if (!page) return;

    const next = refreshBindings(update(page.elements), changed);
    if (sameElements(page.elements, next)) return;

    record(options);
    commit({
        ...document,
        pages: document.pages.map((p) => (p.id === targetId ? { ...p, elements: next } : p)),
    });
}

/**
 * Appends elements on top of the active page.
 *
 * @param elements - Elements to add, with unique ids
 * @param options - record: false skips the undo step, mergeKey merges a burst into one step
 */
export function addElements(elements: WispenElement[], options?: MutationOptions): void {
    if (elements.length === 0) return;
    mutateElements(
        (current) => [...current, ...elements],
        new Set(elements.map((el) => el.id)),
        options,
    );
}

/**
 * Applies a patch to elements of the active page.
 *
 * @param ids - Elements to change; unknown ids are ignored
 * @param patch - Properties to change, or a function of each element returning them
 * @param options - record: false skips the undo step, mergeKey merges a burst into one step
 */
export function updateElements(
    ids: string[],
    patch: ElementPatch | ((element: WispenElement) => ElementPatch),
    options?: MutationOptions,
): void {
    const wanted = new Set(ids);
    if (wanted.size === 0) return;
    mutateElements(
        (current) => current.map((el) => (wanted.has(el.id) ? patchElement(el, patch) : el)),
        wanted,
        options,
    );
}

/**
 * Replaces elements of the active page by updated versions computed by the caller, restoring
 * their derived geometry (line bounds, text size) like updateElements does.
 *
 * @param replacements - Next version of each changed element, by id
 * @param options - record: false skips the undo step, mergeKey merges a burst into one step
 */
export function replaceElements(
    replacements: Map<string, WispenElement>,
    options?: MutationOptions,
): void {
    if (replacements.size === 0) return;
    mutateElements(
        (current) =>
            current.map((el) => {
                const next = replacements.get(el.id);
                return next ? finalizeElement(next) : el;
            }),
        new Set(replacements.keys()),
        options,
    );
}

/**
 * Removes elements from the active page and from the selection.
 *
 * @param ids - Ids of the elements to delete; unknown ids are ignored
 * @param options - record: false skips the undo step, mergeKey merges a burst into one step
 */
export function deleteElements(ids: string[], options?: MutationOptions): void {
    const doomed = new Set(ids);
    if (doomed.size === 0) return;
    mutateElements((current) => current.filter((el) => !doomed.has(el.id)), doomed, options);
    editorStore.setState((state) => ({
        selectedIds: state.selectedIds.filter((id) => !doomed.has(id)),
        editingId: state.editingId && doomed.has(state.editingId) ? null : state.editingId,
    }));
}

/**
 * Moves elements in the stacking order of the active page.
 *
 * @param ids - Elements to move, keeping their relative order
 * @param direction - One step forward or backward, or all the way to the front or back
 */
export function reorderElements(
    ids: string[],
    direction: "forward" | "backward" | "front" | "back",
): void {
    const moving = new Set(ids);
    if (moving.size === 0) return;
    mutateElements((current) => {
        const picked = current.filter((el) => moving.has(el.id));
        const rest = current.filter((el) => !moving.has(el.id));
        if (direction === "front") return [...rest, ...picked];
        if (direction === "back") return [...picked, ...rest];

        const next = [...current];
        const indices = next.map((el, i) => (moving.has(el.id) ? i : -1)).filter((i) => i >= 0);
        if (direction === "forward") {
            for (let k = indices.length - 1; k >= 0; k--) {
                const i = indices[k];
                if (i < next.length - 1 && !moving.has(next[i + 1].id)) {
                    [next[i], next[i + 1]] = [next[i + 1], next[i]];
                }
            }
        } else {
            for (const i of indices) {
                if (i > 0 && !moving.has(next[i - 1].id))
                    [next[i], next[i - 1]] = [next[i - 1], next[i]];
            }
        }
        return next;
    }, new Set());
}

/**
 * Restores the previous history step.
 */
export function undo(): void {
    const { past, future, document } = documentStore.getState();
    const previous = past[past.length - 1];
    if (!previous) return;
    lastMerge = null;
    documentStore.setState((state) => ({
        past: past.slice(0, -1),
        future: [{ pages: document.pages, activePageId: document.activePageId }, ...future],
        document: { ...document, ...previous, updatedAt: Date.now() },
        revision: state.revision + 1,
    }));
    pruneSelection();
}

/**
 * Saves the undo and redo stacks, so the changes recorded after this point can be cancelled
 * with rollback.
 *
 * @returns The mark, to hand to rollback
 */
export function markHistory(): HistoryMark {
    const { past, future } = documentStore.getState();
    return { past, future };
}

/**
 * Cancels every undo step recorded since a mark: restores the document saved by the first of
 * them and puts both stacks back as they were, so the cancelled change cannot be redone and the
 * redo history survives.
 *
 * @param mark - Stacks saved by markHistory before the change; nothing happens when no step was
 * recorded since
 */
export function rollback(mark: HistoryMark): void {
    const { past, document } = documentStore.getState();
    const known = new Set(mark.past);
    const first = past.find((snapshot) => !known.has(snapshot));
    if (!first) return;
    lastMerge = null;
    documentStore.setState((state) => ({
        past: [...mark.past],
        future: [...mark.future],
        document: { ...document, ...first, updatedAt: Date.now() },
        revision: state.revision + 1,
    }));
    pruneSelection();
}

/**
 * Re-applies the last undone step.
 */
export function redo(): void {
    const { past, future, document } = documentStore.getState();
    const next = future[0];
    if (!next) return;
    lastMerge = null;
    documentStore.setState((state) => ({
        past: [...past, { pages: document.pages, activePageId: document.activePageId }],
        future: future.slice(1),
        document: { ...document, ...next, updatedAt: Date.now() },
        revision: state.revision + 1,
    }));
    pruneSelection();
}

/**
 * Drops selected or edited ids that no longer exist on the active page.
 */
function pruneSelection(): void {
    const ids = new Set(getElements().map((el) => el.id));
    editorStore.setState((state) => ({
        selectedIds: state.selectedIds.filter((id) => ids.has(id)),
        editingId: state.editingId && ids.has(state.editingId) ? state.editingId : null,
    }));
}

/**
 * Loads a document, resetting the history and the selection.
 *
 * @param document - Document to display; a stale activePageId falls back to its first page
 */
export function loadDocument(document: WispenDocument): void {
    lastMerge = null;
    const activePageId = document.pages.some((p) => p.id === document.activePageId)
        ? document.activePageId
        : document.pages[0].id;
    documentStore.setState((state) => ({
        document: { ...document, activePageId },
        past: [],
        future: [],
        revision: state.revision + 1,
    }));
    editorStore.setState({ selectedIds: [], editingId: null });
}

/**
 * Renames the document.
 *
 * @param name - New name; blank names and the current name are ignored
 */
export function renameDocument(name: string): void {
    const trimmed = name.trim();
    const { document } = documentStore.getState();
    if (!trimmed || trimmed === document.name) return;
    commit({ ...document, name: trimmed });
}

/**
 * Switches the displayed page, leaving the selection behind.
 *
 * @param pageId - Page to display; unknown ids are ignored
 */
export function setActivePage(pageId: string): void {
    const { document } = documentStore.getState();
    if (!document.pages.some((p) => p.id === pageId) || document.activePageId === pageId) return;
    commit({ ...document, activePageId: pageId });
    editorStore.setState({ selectedIds: [], editingId: null });
}

/**
 * Inserts a page after the active one and displays it.
 *
 * @param page - Page to insert; it becomes the active page
 */
export function insertPage(page: Page): void {
    const { document } = documentStore.getState();
    checkpoint();
    const index = document.pages.findIndex((p) => p.id === document.activePageId);
    const pages = [...document.pages];
    pages.splice(index + 1, 0, page);
    commit({ ...document, pages, activePageId: page.id });
    editorStore.setState({ selectedIds: [], editingId: null });
}

/**
 * Renames a page.
 *
 * @param pageId - Id of the page to rename; unknown ids are ignored
 * @param name - New name; blank names and the current name are ignored
 */
export function renamePage(pageId: string, name: string): void {
    const trimmed = name.trim();
    const { document } = documentStore.getState();
    const page = document.pages.find((p) => p.id === pageId);
    if (!trimmed || !page || page.name === trimmed) return;
    checkpoint();
    commit({
        ...document,
        pages: document.pages.map((p) => (p.id === pageId ? { ...p, name: trimmed } : p)),
    });
}

/**
 * Deletes a page, keeping at least one page in the document.
 *
 * @param pageId - Id of the page to delete; nothing happens when it is the only page
 */
export function deletePage(pageId: string): void {
    const { document } = documentStore.getState();
    if (document.pages.length <= 1) return;
    checkpoint();
    const index = document.pages.findIndex((p) => p.id === pageId);
    const pages = document.pages.filter((p) => p.id !== pageId);
    const activePageId =
        document.activePageId === pageId ? pages[Math.max(0, index - 1)].id : document.activePageId;
    commit({ ...document, pages, activePageId });
    editorStore.setState({ selectedIds: [], editingId: null });
}

/**
 * Moves a page to another position of the tab bar.
 *
 * @param pageId - Id of the page to move; unknown ids are ignored
 * @param index - Target position, clamped to the page count
 */
export function movePage(pageId: string, index: number): void {
    const { document } = documentStore.getState();
    const from = document.pages.findIndex((p) => p.id === pageId);
    const to = Math.max(0, Math.min(document.pages.length - 1, index));
    if (from < 0 || from === to) return;
    checkpoint();
    const pages = [...document.pages];
    const [page] = pages.splice(from, 1);
    pages.splice(to, 0, page);
    commit({ ...document, pages });
}

/**
 * Measures every text block again, without an undo step, once web fonts have loaded and text
 * sizes computed with fallback fonts are stale.
 */
export function refreshTextLayout(): void {
    const { document } = documentStore.getState();
    let changed = false;
    const pages = document.pages.map((page) => {
        const elements = page.elements.map((el) => {
            const next = finalizeElement(el);
            if (next !== el) changed = true;
            return next;
        });
        return changed ? { ...page, elements: refreshBindings(elements) } : page;
    });
    if (changed) commit({ ...document, pages });
}
