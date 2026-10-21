import {
    buildElement,
    cloneElements,
    elementBounds,
    expandGroups,
    moveElement,
} from "@/lib/canvas/elements";
import { boundsCenter, unionBounds } from "@/lib/canvas/geometry";
import { viewportCenter } from "@/lib/canvas/viewport";
import { getTranslator } from "@/lib/i18n";
import { createId } from "@/lib/id";
import { getShape } from "@/lib/registry";
import { loadImageFile } from "@/lib/storage/images";
import { normalizeElement } from "@/lib/storage/serialization";
import {
    addElements,
    checkpoint,
    createPage,
    deleteElements,
    documentStore,
    getActivePage,
    getElements,
    getSelectedElements,
    type HistoryMark,
    insertPage,
    reorderElements,
    replaceElements,
    rollback,
    setActivePage,
    updateElements,
} from "@/lib/stores/document";
import {
    editorStore,
    setSelection,
    type StyleDefaults,
    updateSettings,
    updateStyle,
} from "@/lib/stores/editor";
import type { ElementPatch } from "@/types/plugin";
import type { Bounds, Point, WispenElement } from "@/types/scene";

// Offset of pasted and duplicated copies, in scene pixels.
const COPY_OFFSET = 20;

let copiedStyle: Partial<StyleDefaults> | null = null;

// Text edit whose undo step is not recorded yet: it is pushed on the first actual change.
let pendingTextStep: string | null = null;

// History before the text block being edited was created, to drop it cleanly if left empty.
let createdText: { id: string; mark: HistoryMark } | null = null;

// Last pasted clipboard content and how many times in a row it was pasted.
let pasteRun = { key: "", count: 0 };

/**
 * Lists the ids of the selected elements that are not locked.
 *
 * @returns Ids in page order, empty when every selected element is locked
 */
function editableSelection(): string[] {
    return getSelectedElements()
        .filter((el) => !el.locked)
        .map((el) => el.id);
}

/**
 * Selects every unlocked element of the active page.
 */
export function selectAll(): void {
    setSelection(
        getElements()
            .filter((el) => !el.locked)
            .map((el) => el.id),
    );
}

/**
 * Deletes the unlocked selected elements.
 */
export function deleteSelection(): void {
    deleteElements(editableSelection());
}

/**
 * Duplicates the selection next to itself and selects the copies.
 */
export function duplicateSelection(): void {
    const copies = cloneElements(getSelectedElements(), { x: COPY_OFFSET, y: COPY_OFFSET });
    if (copies.length === 0) return;
    addElements(copies);
    setSelection(copies.map((el) => el.id));
}

/**
 * Gathers the selected elements in a new group, selected and moved together from now on.
 */
export function groupSelection(): void {
    const selected = getSelectedElements().filter((el) => !el.locked);
    if (selected.length < 2) return;
    const current = selected[0].groupId;
    if (current && selected.every((el) => el.groupId === current)) return;
    const groupId = createId();
    updateElements(
        selected.map((el) => el.id),
        { groupId },
    );
}

/**
 * Dissolves the groups of the selected elements.
 */
export function ungroupSelection(): void {
    const ids = getSelectedElements()
        .filter((el) => el.groupId)
        .map((el) => el.id);
    updateElements(ids, { groupId: null });
}

/**
 * Changes the stacking order of the selection.
 *
 * @param direction - One step forward or backward, or all the way to the front or back
 */
export function arrangeSelection(direction: "forward" | "backward" | "front" | "back"): void {
    reorderElements(
        getSelectedElements().map((el) => el.id),
        direction,
    );
}

/**
 * Locks the selection when any selected element is unlocked, unlocks it otherwise. Locked
 * elements cannot be moved, resized, deleted or picked on the canvas.
 */
export function toggleLockSelection(): void {
    const selected = getSelectedElements();
    if (selected.length === 0) return;
    const lock = selected.some((el) => !el.locked);
    updateElements(
        selected.map((el) => el.id),
        { locked: lock },
    );
    if (lock) setSelection([]);
}

/**
 * Unlocks every element of the active page and selects them.
 */
export function unlockAll(): void {
    const locked = getElements().filter((el) => el.locked);
    updateElements(
        locked.map((el) => el.id),
        { locked: false },
    );
    setSelection(locked.map((el) => el.id));
}

/**
 * Moves the selection by a fixed amount, detaching arrow ends from shapes left behind as a drag
 * does. Presses within a second merge into one undo step.
 *
 * @param dx - Horizontal move in scene pixels
 * @param dy - Vertical move in scene pixels
 */
export function nudgeSelection(dx: number, dy: number): void {
    const selected = getSelectedElements().filter((el) => !el.locked);
    const moving = new Set(selected.map((el) => el.id));
    replaceElements(new Map(selected.map((el) => [el.id, moveElement(el, dx, dy, moving)])), {
        mergeKey: "nudge",
    });
}

/**
 * Splits a selection into blocks moved as one: each group, and each ungrouped element.
 *
 * @param selected - Selected elements, locked ones excluded by the caller
 * @returns The members and union bounds of each block, in selection order
 */
function selectionBlocks(
    selected: WispenElement[],
): { members: WispenElement[]; bounds: Bounds }[] {
    const blocks = new Map<string, WispenElement[]>();
    for (const el of selected) {
        const key = el.groupId ?? el.id;
        blocks.set(key, [...(blocks.get(key) ?? []), el]);
    }
    return [...blocks.values()].map((members) => ({
        members,
        bounds: unionBounds(members.map(elementBounds)) as Bounds,
    }));
}

/**
 * Translates blocks of the selection by their own offsets in one undo step.
 *
 * @param moves - Each block with its horizontal and vertical offset in scene pixels; blocks
 * that do not move are skipped
 */
function moveBlocks(moves: { members: WispenElement[]; dx: number; dy: number }[]): void {
    const moving = new Set(moves.flatMap(({ members }) => members.map((el) => el.id)));
    const replacements = new Map<string, WispenElement>();
    for (const { members, dx, dy } of moves) {
        if (dx === 0 && dy === 0) continue;
        for (const el of members) replacements.set(el.id, moveElement(el, dx, dy, moving));
    }
    replaceElements(replacements);
}

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

/**
 * Aligns the selected elements on an edge or the center of their common bounds; grouped
 * elements move as one block.
 *
 * @param alignment - Edge or axis to align on
 */
export function alignSelection(alignment: Alignment): void {
    const selected = getSelectedElements().filter((el) => !el.locked);
    const bounds = unionBounds(selected.map(elementBounds));
    if (!bounds || selected.length < 2) return;

    const moves = selectionBlocks(selected).map(({ members, bounds: block }) => {
        let dx = 0;
        let dy = 0;
        if (alignment === "left") dx = bounds.x - block.x;
        if (alignment === "center") dx = bounds.x + bounds.width / 2 - (block.x + block.width / 2);
        if (alignment === "right") dx = bounds.x + bounds.width - (block.x + block.width);
        if (alignment === "top") dy = bounds.y - block.y;
        if (alignment === "middle")
            dy = bounds.y + bounds.height / 2 - (block.y + block.height / 2);
        if (alignment === "bottom") dy = bounds.y + bounds.height - (block.y + block.height);
        return { members, dx, dy };
    });
    moveBlocks(moves);
}

/**
 * Spreads the selected elements so the gaps between them are equal along an axis; grouped
 * elements move as one block.
 *
 * @param axis - "horizontal" distributes left to right, "vertical" top to bottom
 */
export function distributeSelection(axis: "horizontal" | "vertical"): void {
    const selected = getSelectedElements().filter((el) => !el.locked);
    const horizontal = axis === "horizontal";
    const position = (b: Bounds) => (horizontal ? b.x : b.y);
    const size = (b: Bounds) => (horizontal ? b.width : b.height);
    const blocks = selectionBlocks(selected).sort(
        (a, b) => position(a.bounds) - position(b.bounds),
    );
    if (blocks.length < 3) return;

    const start = position(blocks[0].bounds);
    const lastBounds = blocks[blocks.length - 1].bounds;
    const end = position(lastBounds) + size(lastBounds);
    const total = blocks.reduce((sum, block) => sum + size(block.bounds), 0);
    const gap = (end - start - total) / (blocks.length - 1);

    let cursor = start;
    const moves = blocks.map(({ members, bounds }) => {
        const delta = cursor - position(bounds);
        cursor += size(bounds) + gap;
        return { members, dx: horizontal ? delta : 0, dy: horizontal ? 0 : delta };
    });
    moveBlocks(moves);
}

/**
 * Applies style properties to the selection and remembers them for the next elements.
 * Repeated changes of the same properties within a second merge into one undo step.
 *
 * @param patch - Style properties to apply
 */
export function applyStyle(patch: Partial<StyleDefaults>): void {
    updateStyle(patch);
    const ids = editableSelection();
    if (ids.length === 0) return;
    updateElements(ids, patch as ElementPatch, {
        mergeKey: `style:${Object.keys(patch).sort().join(",")}`,
    });
}

/**
 * Remembers the style of the first selected element.
 */
export function copyStyle(): void {
    const [el] = getSelectedElements();
    if (!el) return;
    const { style } = editorStore.getState();
    copiedStyle = Object.fromEntries(
        Object.keys(style)
            .filter((key) => key in el)
            .map((key) => [key, el[key as keyof WispenElement]]),
    ) as Partial<StyleDefaults>;
}

/**
 * Tells whether a style was copied and can be pasted.
 *
 * @returns true after copyStyle ran on a selection
 */
export function hasCopiedStyle(): boolean {
    return copiedStyle !== null;
}

/**
 * Applies the style remembered by copyStyle to the selection.
 */
export function pasteStyle(): void {
    if (copiedStyle) applyStyle(copiedStyle);
}

/**
 * Starts editing the text of an element in place. The undo step of the edit is recorded on the
 * first change only, so opening and leaving the editor without typing adds none.
 *
 * @param id - Element whose shape supports text
 * @param created - History saved just before the element was created by the same gesture: its
 * creation step covers the text, and is rolled back if the block is left empty
 */
export function startEditing(id: string, created?: HistoryMark): void {
    const element = getElements().find((el) => el.id === id);
    if (!element || element.locked || !getShape(element.type).text) return;
    pendingTextStep = created ? null : id;
    createdText = created ? { id, mark: created } : null;
    editorStore.setState({ editingId: id, selectedIds: [id] });
}

/**
 * Replaces the text of the element being edited, recording the undo step of the edit on the
 * first change.
 *
 * @param id - Id of the element being edited, as given to startEditing
 * @param text - Full text typed so far
 */
export function editText(id: string, text: string): void {
    if (pendingTextStep === id) {
        checkpoint(`text:${id}`);
        pendingTextStep = null;
    }
    updateElements([id], { text }, { record: false });
}

/**
 * Leaves in-place text editing, deleting text blocks left empty. A block created for this edit
 * disappears with its creation step, leaving no empty undo step behind.
 */
export function stopEditing(): void {
    const { editingId } = editorStore.getState();
    if (!editingId) return;
    const element = getElements().find((el) => el.id === editingId);
    const created = createdText?.id === editingId ? createdText.mark : null;
    pendingTextStep = null;
    createdText = null;
    editorStore.setState({ editingId: null });
    if (element && getShape(element.type).text === "content" && !element.text.trim()) {
        if (created) rollback(created);
        else deleteElements([element.id], { record: false });
    }
}

/**
 * Creates elements centered on a point and selects them.
 *
 * @param elements - Elements positioned anywhere; they keep their relative layout
 * @param at - Scene point to center them on; defaults to the middle of the visible area
 */
export function placeElements(elements: WispenElement[], at: Point = viewportCenter()): void {
    const bounds = unionBounds(elements.map(elementBounds));
    if (!bounds) return;
    const center = boundsCenter(bounds);
    const moved = elements.map((el) => ({
        ...el,
        x: el.x + at.x - center.x,
        y: el.y + at.y - center.y,
    }));
    addElements(moved);
    setSelection(moved.map((el) => el.id));
    editorStore.setState({
        tool: editorStore.getState().toolLocked ? editorStore.getState().tool : "select",
    });
}

/**
 * Inserts picture files as image elements laid out side by side around a point.
 *
 * @param files - Image files; unreadable ones are skipped with a notification
 * @param at - Scene point to center the pictures on; defaults to the middle of the visible area
 * @returns The number of pictures inserted
 */
export async function insertImages(files: Blob[], at?: Point): Promise<number> {
    const { style } = editorStore.getState();
    const elements: WispenElement[] = [];
    let x = 0;
    for (const file of files) {
        try {
            const image = await loadImageFile(file);
            const scale = Math.min(1, 600 / Math.max(image.width, image.height));
            const width = Math.round(image.width * scale);
            const height = Math.round(image.height * scale);
            elements.push(buildElement("image", style, { x, y: 0, width, height, src: image.src }));
            x += width + COPY_OFFSET;
        } catch {
            const { toast } = await import("sonner");
            toast.error(getTranslator("common")("imageError"));
        }
    }
    placeElements(elements, at);
    return elements.length;
}

/**
 * Inserts plain text as a text block.
 *
 * @param text - Text to insert; blank text is ignored
 * @param at - Scene point to center it on; defaults to the middle of the visible area
 */
export function insertText(text: string, at?: Point): void {
    if (!text.trim()) return;
    const element = buildElement("text", editorStore.getState().style, { text: text.trimEnd() });
    placeElements([element], at);
}

/**
 * Pastes elements copied from the app or produced by an importer, repaired like a loaded
 * file and given fresh ids. Pasting the same content again offsets each copy a little further.
 *
 * @param elements - Copied elements, untrusted: malformed entries are repaired or skipped
 * @param at - Scene point to center them on; defaults to a small offset from the originals
 */
export function pasteElements(elements: unknown[], at?: Point): void {
    const known = elements.map(normalizeElement).filter((el): el is WispenElement => el !== null);
    if (known.length === 0) return;
    if (at) {
        placeElements(cloneElements(known, { x: 0, y: 0 }), at);
        return;
    }
    const key = known.map((el) => `${el.id}:${el.x}:${el.y}`).join("|");
    pasteRun = { key, count: key === pasteRun.key ? pasteRun.count + 1 : 1 };
    const offset = COPY_OFFSET * pasteRun.count;
    const copies = cloneElements(known, { x: offset, y: offset });
    addElements(copies);
    setSelection(copies.map((el) => el.id));
}

/**
 * Shows or hides the background grid.
 */
export function toggleGrid(): void {
    updateSettings({ showGrid: !editorStore.getState().settings.showGrid });
}

/**
 * Turns snapping to the grid on or off.
 */
export function toggleSnap(): void {
    updateSettings({ snapToGrid: !editorStore.getState().settings.snapToGrid });
}

/**
 * Keeps the active creation tool after drawing, or goes back to selection after each shape.
 */
export function toggleToolLock(): void {
    editorStore.setState((state) => ({ toolLocked: !state.toolLocked }));
}

/**
 * Adds an empty page after the active one, named after its position.
 */
export function addPage(): void {
    const t = getTranslator("common");
    const count = documentStore.getState().document.pages.length;
    insertPage(createPage(t("pageName", { number: count + 1 })));
}

/**
 * Inserts a copy of a page after the active one, with fresh element ids.
 *
 * @param pageId - Id of the page to copy; an unknown id does nothing
 */
export function duplicatePage(pageId: string): void {
    const page = documentStore.getState().document.pages.find((p) => p.id === pageId);
    if (!page) return;
    const t = getTranslator("common");
    insertPage({
        ...createPage(t("copyOf", { name: page.name })),
        elements: cloneElements(page.elements, { x: 0, y: 0 }),
    });
}

/**
 * Displays the next or previous page, wrapping around.
 *
 * @param step - 1 for the next page, -1 for the previous one
 */
export function cyclePage(step: 1 | -1): void {
    const { pages } = documentStore.getState().document;
    const index = pages.findIndex((p) => p.id === getActivePage().id);
    setActivePage(pages[(index + step + pages.length) % pages.length].id);
}

/**
 * Selects elements and every member of their groups.
 *
 * @param ids - Ids of the elements to select; the other members of their groups are added
 * @param additive - Toggles the elements in the current selection instead of replacing it
 */
export function selectElements(ids: string[], additive = false): void {
    const expanded = expandGroups(ids, getElements());
    if (!additive) {
        setSelection(expanded);
        return;
    }
    const current = new Set(editorStore.getState().selectedIds);
    const allSelected = expanded.every((id) => current.has(id));
    for (const id of expanded) {
        if (allSelected) current.delete(id);
        else current.add(id);
    }
    setSelection([...current]);
}
