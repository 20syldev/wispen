import { BINDING_GAP, createBinding } from "@/lib/canvas/binding";
import {
    buildElement,
    cloneElements,
    elementsInside,
    expandGroups,
    finalizeElement,
    hitTest,
    moveElement,
} from "@/lib/canvas/elements";
import {
    boundsContain,
    boundsFromPoints,
    distance,
    distanceToSegment,
    screenToScene,
    snap,
    snapPoint,
} from "@/lib/canvas/geometry";
import {
    getHandles,
    handleAt,
    RESIZE_CURSORS,
    type ResizeHandleId,
    selectionBounds,
} from "@/lib/canvas/handles";
import { absolutePoints } from "@/lib/canvas/routing";
import { LINE_HEIGHT } from "@/lib/canvas/text";
import { currentViewport, setCurrentViewport, zoomBy } from "@/lib/canvas/viewport";
import { selectElements, startEditing, stopEditing } from "@/lib/editor/actions";
import { getShape, getTool } from "@/lib/registry";
import {
    addElements,
    checkpoint,
    deleteElements,
    getElements,
    getSelectedElements,
    type HistoryMark,
    markHistory,
    replaceElements,
    rollback,
    updateElements,
} from "@/lib/stores/document";
import { type CursorName, editorStore, setSelection, setTool } from "@/lib/stores/editor";
import type { ElementPatch, ShapeDefinition } from "@/types/plugin";
import type { Binding, Bounds, Point, Viewport, WispenElement } from "@/types/scene";

export interface PointerInput {
    screen: Point;
    pointerId: number;
    pointerType: string;
    button: number;
    shiftKey: boolean;
    altKey: boolean;
    modKey: boolean;
}

export interface WheelInput {
    screen: Point;
    deltaX: number;
    deltaY: number;
    lines: boolean;
    shiftKey: boolean;
    modKey: boolean;
}

type Gesture =
    | { type: "pan"; start: Point; origin: Viewport }
    | { type: "marquee"; start: Point; initial: string[] }
    | {
          type: "move";
          start: Point;
          screenStart: Point;
          started: boolean;
          duplicate: boolean;
          hitId: string | null;
          wasSelected: boolean;
          shift: boolean;
          originals: WispenElement[];
          bounds: Bounds | null;
      }
    | {
          type: "resize";
          handle: ResizeHandleId;
          start: Point;
          screenStart: Point;
          originals: WispenElement[];
          bounds: Bounds;
          started: boolean;
      }
    | { type: "box"; shape: ShapeDefinition; start: Point; screenStart: Point; id: string | null }
    | {
          type: "linear";
          shape: ShapeDefinition;
          start: Point;
          screenStart: Point;
          binding: Binding | null;
          id: string | null;
      }
    | { type: "vertex"; id: string; index: number; screenStart: Point; started: boolean }
    | { type: "midpoint"; id: string; index: number; screenStart: Point }
    | { type: "freedraw"; shape: ShapeDefinition; start: Point; id: string | null; last: Point }
    | { type: "text"; screenStart: Point; start: Point }
    | { type: "erase"; last: Point; ids: Set<string> }
    | { type: "pinch"; center: Point; spread: number; origin: Viewport };

// Pointer travel, in screen pixels, below which a press counts as a click.
const DRAG_THRESHOLD = 4;

// Hit margin around strokes, in screen pixels.
const HIT_TOLERANCE = 6;

// Ctrl + wheel deltas at or above this size, in pixels, come from mouse wheel notches.
const WHEEL_NOTCH = 50;

let gesture: Gesture | null = null;

// Undo and redo stacks when the current gesture started, restored when it is cancelled.
let historyMark: HistoryMark | null = null;
let spacePressed = false;
let contextPoint: Point | null = null;
const touches = new Map<number, Point>();

/**
 * Records whether the space bar is held, which turns any drag into panning.
 *
 * @param pressed - true while the space bar is held down, false once released
 */
export function setSpacePressed(pressed: boolean): void {
    spacePressed = pressed;
    if (!gesture) setCursor(pressed ? "grab" : idleCursor());
}

/**
 * Returns where the canvas was last right-clicked, so the context menu pastes there.
 *
 * @returns The scene position of the last right-click, or undefined before any
 */
export function getContextPoint(): Point | undefined {
    return contextPoint ?? undefined;
}

/**
 * Tells whether a gesture is in progress, so keyboard shortcuts can stay out of its way.
 *
 * @returns true while the pointer is pressed on the canvas
 */
export function isInteracting(): boolean {
    return gesture !== null;
}

/**
 * Updates the canvas cursor when it changes.
 *
 * @param cursor - Cursor to show; the store is written only when it changes
 */
function setCursor(cursor: CursorName): void {
    if (editorStore.getState().cursor !== cursor) editorStore.setState({ cursor });
}

/**
 * Returns the cursor matching the active tool when nothing is hovered.
 *
 * @returns The idle cursor of the active tool, without any hover or gesture override
 */
function idleCursor(): CursorName {
    const { tool } = editorStore.getState();
    if (tool === "select") return "default";
    if (tool === "hand") return "grab";
    if (tool === "text") return "text";
    return "crosshair";
}

/**
 * Grid spacing to snap to for the current event: the grid setting, inverted while Ctrl/Cmd is
 * held.
 *
 * @param input - Pointer event, read for the modifier
 * @returns The spacing in scene pixels, or 0 when snapping is off
 */
function snapSize(input: PointerInput): number {
    const { snapToGrid, gridSize } = editorStore.getState().settings;
    return snapToGrid !== input.modKey ? gridSize : 0;
}

/**
 * Snaps a point to the grid when snapping applies to the event.
 *
 * @param point - Scene position
 * @param input - Pointer event, read for the modifier
 * @returns The snapped or unchanged point
 */
function snapIfNeeded(point: Point, input: PointerInput): Point {
    const size = snapSize(input);
    return size ? snapPoint(point, size) : point;
}

/**
 * Finds the topmost unlocked element under a scene point.
 *
 * @param point - Scene position
 * @returns The element, or null
 */
function selectableAt(point: Point): WispenElement | null {
    return hitTest(
        getElements(),
        point,
        HIT_TOLERANCE / currentViewport().zoom,
        (el) => !el.locked,
    );
}

/**
 * Finds the topmost shape an arrow end can attach to under a scene point. The reach extends
 * past the gap left between bound ends and outlines, so an end released where it already sat
 * stays bound.
 *
 * @param point - Scene position
 * @param exclude - Ids that must not be picked (the line itself, its other end's target)
 * @returns The shape, or null
 */
function bindableAt(point: Point, exclude: Set<string>): WispenElement | null {
    return hitTest(
        getElements(),
        point,
        Math.max(BINDING_GAP + 4, 10 / currentViewport().zoom),
        (el) => !el.locked && !exclude.has(el.id) && Boolean(getShape(el.type).bindable),
    );
}

/**
 * Returns the element of the active page with a given id.
 *
 * @param id - Element id; an id that belongs to another page finds nothing
 * @returns The element, or undefined once deleted
 */
function findElement(id: string): WispenElement | undefined {
    return getElements().find((el) => el.id === id);
}

/**
 * Leaves a creation tool after use unless the tool is locked, keeping the new element selected.
 *
 * @param id - Id of the element just created, selected once the tool is left
 */
function finishCreation(id: string): void {
    if (!editorStore.getState().toolLocked) setTool("select");
    setSelection([id]);
}

/**
 * Starts a gesture on the canvas. Touch presses are tracked so a second finger turns into a
 * pinch, and a press while a text is being edited only ends the edit. Middle button, space bar
 * and the hand tool pan, the secondary button selects for the context menu, and the primary
 * button starts the gesture of the active tool.
 *
 * @param input - Normalized pointer event; its button is 0 for primary, 1 for middle, 2 for
 * secondary
 */
export function pointerDown(input: PointerInput): void {
    if (input.pointerType === "touch") {
        touches.set(input.pointerId, input.screen);
        if (touches.size === 2) {
            startPinch();
            return;
        }
        if (touches.size > 2) return;
    }

    if (editorStore.getState().editingId) {
        stopEditing();
        return;
    }

    historyMark = markHistory();
    const viewport = currentViewport();
    const scene = screenToScene(input.screen, viewport);
    const { tool } = editorStore.getState();

    if (input.button === 1 || spacePressed || tool === "hand") {
        gesture = { type: "pan", start: input.screen, origin: viewport };
        setCursor("grabbing");
        return;
    }

    if (input.button === 2) {
        contextPoint = scene;
        const hit = selectableAt(scene);
        if (!hit) setSelection([]);
        else if (!editorStore.getState().selectedIds.includes(hit.id)) selectElements([hit.id]);
        return;
    }
    if (input.button !== 0) return;

    if (tool === "select") {
        selectDown(input, scene);
        return;
    }

    if (tool === "eraser") {
        gesture = { type: "erase", last: scene, ids: new Set() };
        eraseAlong(scene, scene);
        return;
    }

    const shapeType = getTool(tool)?.shape;
    if (!shapeType) return;
    const shape = getShape(shapeType);

    if (shape.text === "content") {
        gesture = { type: "text", screenStart: input.screen, start: scene };
        return;
    }

    if (shape.kind === "linear") {
        const target = bindableAt(scene, new Set());
        gesture = {
            type: "linear",
            shape,
            start: target ? scene : snapIfNeeded(scene, input),
            screenStart: input.screen,
            binding: target ? createBinding(target, scene, viewport.zoom) : null,
            id: null,
        };
        return;
    }

    if (shape.kind === "freedraw") {
        gesture = { type: "freedraw", shape, start: scene, id: null, last: scene };
        return;
    }

    gesture = {
        type: "box",
        shape,
        start: snapIfNeeded(scene, input),
        screenStart: input.screen,
        id: null,
    };
}

/**
 * Handles a press with the selection tool: handles first, then elements, then the inside of a
 * multiple selection, and finally a marquee on empty canvas. Shift adds an element on press but
 * removes a selected one only on release, so Shift can still drag the selection.
 *
 * @param input - Normalized pointer event
 * @param scene - Pointer position in scene coordinates
 */
function selectDown(input: PointerInput, scene: Point): void {
    const zoom = currentViewport().zoom;
    const selected = getSelectedElements().filter((el) => !el.locked);
    const handle = handleAt(getHandles(selected, zoom), scene, zoom);

    if (handle?.kind === "resize") {
        const bounds = selectionBounds(selected);
        if (bounds) {
            gesture = {
                type: "resize",
                handle: handle.id,
                start: scene,
                screenStart: input.screen,
                originals: selected,
                bounds,
                started: false,
            };
            return;
        }
    }
    if (handle?.kind === "vertex") {
        gesture = {
            type: "vertex",
            id: selected[0].id,
            index: handle.index,
            screenStart: input.screen,
            started: false,
        };
        return;
    }
    if (handle?.kind === "midpoint") {
        gesture = {
            type: "midpoint",
            id: selected[0].id,
            index: handle.index,
            screenStart: input.screen,
        };
        return;
    }

    const base = {
        type: "move" as const,
        start: scene,
        screenStart: input.screen,
        started: false,
        duplicate: input.altKey,
        shift: input.shiftKey,
        originals: [],
        bounds: null,
    };

    const hit = selectableAt(scene);
    if (hit) {
        const wasSelected = editorStore.getState().selectedIds.includes(hit.id);
        if (!wasSelected) selectElements([hit.id], input.shiftKey);
        gesture = { ...base, hitId: hit.id, wasSelected };
        return;
    }

    const bounds = selected.length > 1 ? selectionBounds(selected) : null;
    if (bounds && boundsContain(bounds, scene) && !input.shiftKey) {
        gesture = { ...base, hitId: null, wasSelected: true };
        return;
    }

    const initial = input.shiftKey ? editorStore.getState().selectedIds : [];
    if (!input.shiftKey) setSelection([]);
    gesture = { type: "marquee", start: scene, initial };
}

/**
 * Advances the current gesture, or updates the hover cursor when no gesture is running.
 *
 * @param input - Normalized pointer event
 */
export function pointerMove(input: PointerInput): void {
    if (input.pointerType === "touch" && touches.has(input.pointerId)) {
        touches.set(input.pointerId, input.screen);
        if (gesture?.type === "pinch") {
            updatePinch();
            return;
        }
    }

    const viewport = currentViewport();
    const scene = screenToScene(input.screen, viewport);
    if (!gesture) {
        updateHover(scene);
        return;
    }

    const g = gesture;
    switch (g.type) {
        case "pan":
            setCurrentViewport({
                ...g.origin,
                x: g.origin.x + input.screen.x - g.start.x,
                y: g.origin.y + input.screen.y - g.start.y,
            });
            return;
        case "marquee": {
            const area = boundsFromPoints(g.start, scene);
            const elements = getElements();
            const inside = expandGroups(elementsInside(elements, area), elements);
            editorStore.setState({ marquee: area });
            setSelection([...new Set([...g.initial, ...inside])]);
            return;
        }
        case "move":
            moveSelection(g, input, scene);
            return;
        case "resize":
            resizeSelection(g, input, scene);
            return;
        case "box":
            drawBox(g, input, scene);
            return;
        case "linear":
            drawLinear(g, input, scene);
            return;
        case "vertex":
            if (!g.started) {
                if (distance(input.screen, g.screenStart) < DRAG_THRESHOLD) return;
                checkpoint();
                g.started = true;
            }
            moveVertex(g.id, g.index, input, scene);
            return;
        case "midpoint": {
            if (distance(input.screen, g.screenStart) < DRAG_THRESHOLD) return;
            const element = findElement(g.id);
            if (!element) return;
            checkpoint();
            const points = absolutePoints(element);
            points.splice(g.index + 1, 0, scene);
            updateElements(
                [g.id],
                { points: points.map((p) => ({ x: p.x - element.x, y: p.y - element.y })) },
                { record: false },
            );
            gesture = {
                type: "vertex",
                id: g.id,
                index: g.index + 1,
                screenStart: g.screenStart,
                started: true,
            };
            moveVertex(g.id, g.index + 1, input, scene);
            return;
        }
        case "freedraw":
            drawFreehand(g, scene);
            return;
        case "erase":
            eraseAlong(g.last, scene);
            g.last = scene;
            return;
        case "text":
        case "pinch":
            return;
    }
}

/**
 * Moves the selection by the pointer travel, snapping its top-left corner to the grid,
 * duplicating it first when Alt was held, and detaching arrow ends from shapes left behind.
 *
 * @param g - Move gesture state
 * @param input - Normalized pointer event
 * @param scene - Pointer position in scene coordinates
 */
function moveSelection(
    g: Extract<Gesture, { type: "move" }>,
    input: PointerInput,
    scene: Point,
): void {
    if (!g.started) {
        if (distance(input.screen, g.screenStart) < DRAG_THRESHOLD) return;
        let selected = getSelectedElements().filter((el) => !el.locked);
        if (selected.length === 0) return;
        g.started = true;
        checkpoint();
        if (g.duplicate) {
            const copies = cloneElements(selected, { x: 0, y: 0 });
            addElements(copies, { record: false });
            setSelection(copies.map((el) => el.id));
            selected = copies;
        }
        g.originals = selected;
        g.bounds = selectionBounds(selected);
        setCursor("move");
    }
    if (!g.bounds) return;

    let dx = scene.x - g.start.x;
    let dy = scene.y - g.start.y;
    if (input.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
    }
    const grid = snapSize(input);
    if (grid) {
        dx = snap(g.bounds.x + dx, grid) - g.bounds.x;
        dy = snap(g.bounds.y + dy, grid) - g.bounds.y;
    }

    const moving = new Set(g.originals.map((el) => el.id));
    const replacements = new Map<string, WispenElement>();
    for (const el of g.originals) replacements.set(el.id, moveElement(el, dx, dy, moving));
    replaceElements(replacements, { record: false });
}

/**
 * Computes the resized selection rectangle from the dragged handle. The returned corners keep
 * the orientation of the original bounds, so they come out swapped when the user drags past the
 * opposite edge.
 *
 * @param g - Resize gesture state
 * @param input - Normalized pointer event (Shift keeps the ratio, Alt resizes from the center)
 * @param scene - Pointer position in scene coordinates
 * @param keepRatio - Ratio lock decided by the caller from the shape and the modifiers
 * @returns The new positions of the original top-left and bottom-right corners
 */
function resizedCorners(
    g: Extract<Gesture, { type: "resize" }>,
    input: PointerInput,
    scene: Point,
    keepRatio: boolean,
): { x0: number; y0: number; x1: number; y1: number } {
    const b = g.bounds;
    const grid = snapSize(input);
    const edge = (value: number) => (grid ? snap(value, grid) : value);
    const dx = scene.x - g.start.x;
    const dy = scene.y - g.start.y;
    const h = g.handle;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;

    let x0 = b.x;
    let y0 = b.y;
    let x1 = b.x + b.width;
    let y1 = b.y + b.height;
    if (h.includes("w")) x0 = edge(b.x + dx);
    if (h.includes("e")) x1 = edge(b.x + b.width + dx);
    if (h.includes("n")) y0 = edge(b.y + dy);
    if (h.includes("s")) y1 = edge(b.y + b.height + dy);

    if (input.altKey) {
        if (h.includes("w")) x1 = 2 * cx - x0;
        if (h.includes("e")) x0 = 2 * cx - x1;
        if (h.includes("n")) y1 = 2 * cy - y0;
        if (h.includes("s")) y0 = 2 * cy - y1;
    }

    if (keepRatio && b.width > 0 && b.height > 0) {
        const corner = h.length === 2;
        if (corner) {
            const w = x1 - x0;
            const hh = y1 - y0;
            const scale = Math.max(Math.abs(w) / b.width, Math.abs(hh) / b.height);
            const sw = (Math.sign(w) || 1) * b.width * scale;
            const sh = (Math.sign(hh) || 1) * b.height * scale;
            if (input.altKey) {
                x0 = cx - sw / 2;
                x1 = cx + sw / 2;
                y0 = cy - sh / 2;
                y1 = cy + sh / 2;
            } else {
                if (h.includes("w")) x0 = x1 - sw;
                else x1 = x0 + sw;
                if (h.includes("n")) y0 = y1 - sh;
                else y1 = y0 + sh;
            }
        } else if (h === "e" || h === "w") {
            const height = (Math.abs(x1 - x0) / b.width) * b.height;
            y0 = cy - height / 2;
            y1 = cy + height / 2;
        } else {
            const width = (Math.abs(y1 - y0) / b.height) * b.width;
            x0 = cx - width / 2;
            x1 = cx + width / 2;
        }
    }

    if (Math.abs(x1 - x0) < 1) x1 = x0 + (x1 >= x0 ? 1 : -1);
    if (Math.abs(y1 - y0) < 1) y1 = y0 + (y1 >= y0 ? 1 : -1);
    return { x0, y0, x1, y1 };
}

/**
 * Resizes a text block mapped to a new box: corners scale the font and keep the block against
 * the opposite corner once measured, side handles fix the width and let the text wrap, and the
 * top and bottom handles of a multiple selection only move it.
 *
 * @param el - Text block as it was when the gesture started
 * @param box - Bounds the block is mapped to, in scene coordinates
 * @param handle - Dragged resize handle: two letters for a corner, one letter for a side
 * @param scale - Font scale applied by corner handles, from the vertical stretch
 * @returns The resized block, with its size measured again
 */
function resizeText(
    el: WispenElement,
    box: Bounds,
    handle: ResizeHandleId,
    scale: number,
): WispenElement {
    if (handle.length === 2) {
        const next = finalizeElement({
            ...el,
            fontSize: Math.max(4, Math.round(el.fontSize * scale * 10) / 10),
            width: el.autoSize === false ? box.width : el.width,
        });
        return {
            ...next,
            x: handle.includes("w") ? box.x + box.width - next.width : box.x,
            y: handle.includes("n") ? box.y + box.height - next.height : box.y,
        };
    }
    if (handle === "e" || handle === "w") {
        const next = finalizeElement({
            ...el,
            width: Math.max(box.width, el.fontSize),
            autoSize: false,
        });
        return { ...next, x: handle === "w" ? box.x + box.width - next.width : box.x };
    }
    return { ...el, y: box.y };
}

/**
 * Resizes the selection by mapping every element from the original bounds to the new ones.
 * Text blocks change width from the side handles and scale their font from the corners;
 * pictures in a multiple selection scale uniformly around their mapped center.
 *
 * @param g - Resize gesture state
 * @param input - Normalized pointer event
 * @param scene - Pointer position in scene coordinates
 */
function resizeSelection(
    g: Extract<Gesture, { type: "resize" }>,
    input: PointerInput,
    scene: Point,
): void {
    if (!g.started) {
        if (distance(input.screen, g.screenStart) < DRAG_THRESHOLD) return;
        checkpoint();
        g.started = true;
    }
    const single = g.originals.length === 1 ? getShape(g.originals[0].type) : null;
    const corner = g.handle.length === 2;
    const forced = Boolean(single?.keepAspectRatio) || (single?.text === "content" && corner);
    const keepRatio = forced ? !(input.shiftKey && single?.keepAspectRatio) : input.shiftKey;
    const { x0, y0, x1, y1 } = resizedCorners(g, input, scene, keepRatio);

    const b = g.bounds;
    const sx = b.width > 0 ? (x1 - x0) / b.width : 1;
    const sy = b.height > 0 ? (y1 - y0) / b.height : 1;
    const mapX = (x: number) => x0 + (x - b.x) * sx;
    const mapY = (y: number) => y0 + (y - b.y) * sy;

    const replacements = new Map<string, WispenElement>();
    for (const el of g.originals) {
        const shape = getShape(el.type);
        if (shape.kind !== "box") {
            const points = absolutePoints(el).map((p) => ({ x: mapX(p.x), y: mapY(p.y) }));
            replacements.set(
                el.id,
                finalizeElement({
                    ...el,
                    points: points.map((p) => ({ x: p.x - el.x, y: p.y - el.y })),
                }),
            );
            continue;
        }

        const ax = mapX(el.x);
        const bx = mapX(el.x + el.width);
        const ay = mapY(el.y);
        const by = mapY(el.y + el.height);
        const box = {
            x: Math.min(ax, bx),
            y: Math.min(ay, by),
            width: Math.abs(bx - ax),
            height: Math.abs(by - ay),
        };

        if (shape.text === "content") {
            replacements.set(el.id, resizeText(el, box, g.handle, Math.abs(sy)));
            continue;
        }
        if (shape.keepAspectRatio && g.originals.length > 1) {
            const factor = Math.min(Math.abs(sx), Math.abs(sy));
            const width = el.width * factor;
            const height = el.height * factor;
            replacements.set(el.id, {
                ...el,
                x: box.x + (box.width - width) / 2,
                y: box.y + (box.height - height) / 2,
                width,
                height,
            });
            continue;
        }
        replacements.set(el.id, { ...el, ...box });
    }
    replaceElements(replacements, { record: false });
}

/**
 * Creates the box shape on the first drag and follows the pointer with its opposite corner;
 * Shift draws a square, Alt draws from the center.
 *
 * @param g - Box creation gesture state
 * @param input - Normalized pointer event
 * @param scene - Pointer position in scene coordinates
 */
function drawBox(g: Extract<Gesture, { type: "box" }>, input: PointerInput, scene: Point): void {
    if (!g.id) {
        if (distance(input.screen, g.screenStart) < DRAG_THRESHOLD) return;
        const element = buildElement(g.shape.type, editorStore.getState().style, {
            x: g.start.x,
            y: g.start.y,
        });
        addElements([element]);
        setSelection([element.id]);
        g.id = element.id;
    }

    const p = snapIfNeeded(scene, input);
    let w = p.x - g.start.x;
    let h = p.y - g.start.y;
    if (input.shiftKey || g.shape.keepAspectRatio) {
        const side = Math.max(Math.abs(w), Math.abs(h));
        w = (Math.sign(w) || 1) * side;
        h = (Math.sign(h) || 1) * side;
    }
    const bounds = input.altKey
        ? boundsFromPoints(
              { x: g.start.x - w, y: g.start.y - h },
              { x: g.start.x + w, y: g.start.y + h },
          )
        : boundsFromPoints(g.start, { x: g.start.x + w, y: g.start.y + h });
    updateElements([g.id], bounds, { record: false });
}

/**
 * Constrains a point so the segment from an origin keeps a multiple of 15 degrees.
 *
 * @param origin - Fixed end of the segment
 * @param point - Free end of the segment, in scene coordinates
 * @returns The constrained free end
 */
function constrainAngle(origin: Point, point: Point): Point {
    const length = distance(origin, point);
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(point.y - origin.y, point.x - origin.x) / step) * step;
    return { x: origin.x + Math.cos(angle) * length, y: origin.y + Math.sin(angle) * length };
}

/**
 * Moves the end of a line being drawn, attaching it to the shape under the pointer.
 *
 * @param g - Line creation gesture state
 * @param input - Normalized pointer event
 * @param scene - Pointer position in scene coordinates
 */
function drawLinear(
    g: Extract<Gesture, { type: "linear" }>,
    input: PointerInput,
    scene: Point,
): void {
    if (!g.id) {
        if (distance(input.screen, g.screenStart) < DRAG_THRESHOLD) return;
        const element = buildElement(g.shape.type, editorStore.getState().style, {
            x: g.start.x,
            y: g.start.y,
            points: [
                { x: 0, y: 0 },
                { x: 0, y: 0 },
            ],
            startBinding: g.binding,
        });
        addElements([element]);
        setSelection([element.id]);
        g.id = element.id;
    }
    moveVertex(g.id, 1, input, scene);
}

/**
 * Moves one point of a line. The first and last points attach to the shape under the pointer
 * (Ctrl/Cmd prevents it); free points snap to the grid, and Shift keeps 15 degree steps.
 *
 * @param id - Id of the line, arrow or freehand element whose point moves
 * @param index - Point index; the last index is the end of the line
 * @param input - Normalized pointer event
 * @param scene - Pointer position in scene coordinates
 */
function moveVertex(id: string, index: number, input: PointerInput, scene: Point): void {
    const element = findElement(id);
    if (!element) return;
    const points = absolutePoints(element);
    const last = points.length - 1;
    const isEnd = index === 0 || index === last;
    const isLinear = getShape(element.type).kind === "linear";

    let target: WispenElement | null = null;
    if (isEnd && isLinear && !input.modKey) {
        const otherBinding = index === 0 ? element.endBinding : element.startBinding;
        const exclude = new Set([element.id, ...(otherBinding ? [otherBinding.elementId] : [])]);
        target = bindableAt(scene, exclude);
    }

    let point = target ? scene : snapIfNeeded(scene, input);
    if (!target && input.shiftKey && points.length > 1) {
        point = constrainAngle(points[index === 0 ? 1 : index - 1], point);
    }
    points[index] = point;

    const patch: Partial<WispenElement> = {
        points: points.map((p) => ({ x: p.x - element.x, y: p.y - element.y })),
    };
    if (isEnd && isLinear) {
        const binding = target ? createBinding(target, scene, currentViewport().zoom) : null;
        if (index === 0) patch.startBinding = binding;
        else patch.endBinding = binding;
    }
    updateElements([id], patch, { record: false });
    editorStore.setState({ bindingTargetId: target?.id ?? null });
}

/**
 * Extends a freehand stroke with the pointer position, creating it on the first move.
 *
 * @param g - Freehand gesture state
 * @param scene - Pointer position in scene coordinates
 */
function drawFreehand(g: Extract<Gesture, { type: "freedraw" }>, scene: Point): void {
    const zoom = currentViewport().zoom;
    if (distance(scene, g.last) * zoom < 1.5) return;
    if (!g.id) {
        const element = buildElement(g.shape.type, editorStore.getState().style, {
            x: g.start.x,
            y: g.start.y,
            points: [{ x: 0, y: 0 }],
        });
        addElements([element]);
        g.id = element.id;
    }
    const element = findElement(g.id);
    if (!element) return;
    const points = [...(element.points ?? []), { x: scene.x - element.x, y: scene.y - element.y }];
    updateElements([g.id], { points }, { record: false });
    g.last = scene;
}

/**
 * Marks the elements crossed by the eraser between two pointer positions.
 *
 * @param from - Previous pointer position in scene coordinates
 * @param to - Current pointer position in scene coordinates
 */
function eraseAlong(from: Point, to: Point): void {
    if (gesture?.type !== "erase") return;
    const zoom = currentViewport().zoom;
    const steps = Math.max(1, Math.ceil((distance(from, to) * zoom) / 4));
    const elements = getElements();
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        const hit = hitTest(elements, point, HIT_TOLERANCE / zoom, (el) => !el.locked);
        if (hit) {
            for (const id of expandGroups([hit.id], elements)) gesture.ids.add(id);
        }
    }
    editorStore.setState({ erasingIds: [...gesture.ids] });
}

/**
 * Ends the current gesture: clicks become default-sized shapes or text blocks, shapes dragged
 * too small and tiny lines are dropped, bends released back on their chord are removed, erased
 * elements are deleted.
 *
 * @param input - Normalized pointer event
 */
export function pointerUp(input: PointerInput): void {
    if (input.pointerType === "touch") {
        touches.delete(input.pointerId);
        if (gesture?.type === "pinch") {
            if (touches.size < 2) gesture = null;
            return;
        }
    }

    const g = gesture;
    gesture = null;
    editorStore.setState({ marquee: null, bindingTargetId: null });
    setCursor(spacePressed ? "grab" : idleCursor());
    if (!g) return;

    switch (g.type) {
        case "move":
            if (!g.started && g.hitId && g.wasSelected) selectElements([g.hitId], g.shift);
            return;
        case "box": {
            if (g.id) {
                const created = findElement(g.id);
                if (created && created.width >= 1 && created.height >= 1) {
                    finishCreation(g.id);
                    return;
                }
                if (historyMark) rollback(historyMark);
            }
            const size = g.shape.defaultSize ?? { width: 120, height: 80 };
            const grid = snapSize(input);
            const corner = { x: g.start.x - size.width / 2, y: g.start.y - size.height / 2 };
            const element = buildElement(g.shape.type, editorStore.getState().style, {
                ...(grid ? snapPoint(corner, grid) : corner),
                ...size,
            });
            addElements([element]);
            finishCreation(element.id);
            return;
        }
        case "linear": {
            if (!g.id) return;
            const created = findElement(g.id);
            const points = created ? absolutePoints(created) : [];
            const length = points.length > 1 ? distance(points[0], points[points.length - 1]) : 0;
            if (length * currentViewport().zoom < DRAG_THRESHOLD) {
                if (historyMark) rollback(historyMark);
                return;
            }
            finishCreation(g.id);
            return;
        }
        case "vertex":
            if (g.started) dropStraightVertex(g.id, g.index, HIT_TOLERANCE);
            return;
        case "freedraw": {
            if (g.id) return;
            const dot = buildElement(g.shape.type, editorStore.getState().style, {
                x: g.start.x,
                y: g.start.y,
                points: [{ x: 0, y: 0 }],
            });
            addElements([dot]);
            return;
        }
        case "text": {
            if (distance(input.screen, g.screenStart) < DRAG_THRESHOLD) {
                createTextAt(g.start);
                return;
            }
            const area = boundsFromPoints(g.start, screenToScene(input.screen, currentViewport()));
            const fixed = area.width >= editorStore.getState().style.fontSize * 2;
            addTextBlock(
                fixed
                    ? { x: area.x, y: area.y, width: area.width, autoSize: false }
                    : { x: area.x, y: area.y },
            );
            return;
        }
        case "erase":
            if (g.ids.size > 0) deleteElements([...g.ids]);
            editorStore.setState({ erasingIds: [] });
            return;
    }
}

/**
 * Removes an inner point of a line lying back on the segment joining its neighbours, so a bend
 * goes away once it is straightened.
 *
 * @param id - Id of the line or arrow
 * @param index - Index of the point; the two ends are never removed
 * @param tolerance - Largest distance to the neighbours' segment, in screen pixels; Infinity
 * removes the point wherever it is
 */
function dropStraightVertex(id: string, index: number, tolerance: number): void {
    const element = findElement(id);
    if (!element || getShape(element.type).kind !== "linear") return;
    const points = absolutePoints(element);
    if (index <= 0 || index >= points.length - 1) return;
    const offset = distanceToSegment(points[index], points[index - 1], points[index + 1]);
    if (offset * currentViewport().zoom > tolerance) return;
    points.splice(index, 1);
    updateElements(
        [id],
        { points: points.map((p) => ({ x: p.x - element.x, y: p.y - element.y })) },
        { record: false },
    );
}

/**
 * Adds a text block with the current style and starts editing it. Its creation step is rolled
 * back if it is left empty.
 *
 * @param patch - Position of the block, plus a width and autoSize: false for fixed-width blocks
 */
function addTextBlock(patch: ElementPatch): void {
    const mark = markHistory();
    const element = buildElement("text", editorStore.getState().style, patch);
    addElements([element]);
    if (!editorStore.getState().toolLocked) setTool("select");
    startEditing(element.id, mark);
}

/**
 * Starts editing a text block at a scene point: the text block already there, or a new one
 * whose first line is centered on the point.
 *
 * @param point - Scene position of the click
 */
function createTextAt(point: Point): void {
    const existing = selectableAt(point);
    if (existing && getShape(existing.type).text === "content") {
        startEditing(existing.id);
        return;
    }
    const { fontSize } = editorStore.getState().style;
    addTextBlock({ x: point.x, y: point.y - (fontSize * LINE_HEIGHT) / 2 });
}

/**
 * Handles a double click with the selection tool: removes the bend point under the pointer,
 * edits the text of the element under the pointer, or creates a text block on empty canvas.
 *
 * @param input - Normalized pointer event
 */
export function doubleClick(input: PointerInput): void {
    if (editorStore.getState().tool !== "select") return;
    const zoom = currentViewport().zoom;
    const scene = screenToScene(input.screen, currentViewport());
    const selected = getSelectedElements().filter((el) => !el.locked);
    const handle = handleAt(getHandles(selected, zoom), scene, zoom);
    const points = selected[0]?.points?.length ?? 0;
    if (handle?.kind === "vertex" && handle.index > 0 && handle.index < points - 1) {
        checkpoint();
        dropStraightVertex(selected[0].id, handle.index, Infinity);
        return;
    }
    const hit = selectableAt(scene);
    if (hit) {
        if (getShape(hit.type).text) startEditing(hit.id);
        return;
    }
    createTextAt(scene);
}

/**
 * Pans with the wheel, or zooms around the pointer when Ctrl/Cmd is held (trackpad pinches
 * arrive as Ctrl + wheel with small deltas, zoomed proportionally; each mouse wheel notch zooms
 * by a fixed step of about 22 %). Shift turns vertical scrolling into horizontal panning.
 *
 * @param input - Normalized wheel event
 */
export function wheel(input: WheelInput): void {
    const factor = input.lines ? 16 : 1;
    const dx = input.deltaX * factor;
    const dy = input.deltaY * factor;
    if (input.modKey) {
        const notch = input.lines || Math.abs(dy) >= WHEEL_NOTCH;
        const amount = notch ? Math.sign(dy) * 20 : Math.max(-20, Math.min(20, dy));
        zoomBy(Math.exp(-amount * 0.01), input.screen);
        return;
    }
    const viewport = currentViewport();
    setCurrentViewport({
        ...viewport,
        x: viewport.x - (input.shiftKey ? dy : dx),
        y: viewport.y - (input.shiftKey ? 0 : dy),
    });
}

/**
 * Starts a two-finger pinch, cancelling whatever the first finger started.
 */
function startPinch(): void {
    cancelGesture();
    const [a, b] = [...touches.values()];
    gesture = {
        type: "pinch",
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        spread: Math.max(distance(a, b), 1),
        origin: currentViewport(),
    };
}

/**
 * Zooms and pans so the scene point under the initial pinch center follows the fingers.
 */
function updatePinch(): void {
    if (gesture?.type !== "pinch" || touches.size < 2) return;
    const [a, b] = [...touches.values()];
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const { origin } = gesture;
    const zoom = Math.max(0.1, Math.min(8, origin.zoom * (distance(a, b) / gesture.spread)));
    const anchor = screenToScene(gesture.center, origin);
    setCurrentViewport({ x: center.x - anchor.x * zoom, y: center.y - anchor.y * zoom, zoom });
}

/**
 * Aborts the current gesture and reverts what it changed: the document and its history, the
 * selection grown by a marquee, the viewport moved by a pan.
 *
 * @returns true when a gesture was running
 */
export function cancelGesture(): boolean {
    const g = gesture;
    if (!g) return false;
    gesture = null;
    editorStore.setState({ marquee: null, bindingTargetId: null, erasingIds: [] });
    setCursor(idleCursor());
    if (historyMark) rollback(historyMark);
    if (g.type === "marquee") setSelection(g.initial);
    if (g.type === "pan") setCurrentViewport(g.origin);
    return true;
}

/**
 * Handles a pointer the browser stopped tracking (system gesture, lost capture): forgets the
 * touch so later single-finger gestures are not taken for pinches, and cancels the gesture.
 *
 * @param input - Normalized pointer event of the cancelled pointer
 */
export function pointerCancel(input: PointerInput): void {
    const tracked = touches.delete(input.pointerId);
    if (gesture?.type === "pinch") {
        if (touches.size < 2) gesture = null;
        return;
    }
    if (tracked || input.pointerType !== "touch") cancelGesture();
}

/**
 * Updates the cursor for the element or handle under the pointer.
 *
 * @param scene - Pointer position in scene coordinates
 */
function updateHover(scene: Point): void {
    if (spacePressed) {
        setCursor("grab");
        return;
    }
    if (editorStore.getState().tool !== "select") {
        setCursor(idleCursor());
        return;
    }
    const zoom = currentViewport().zoom;
    const selected = getSelectedElements().filter((el) => !el.locked);
    const handle = handleAt(getHandles(selected, zoom), scene, zoom);
    if (handle) {
        setCursor(handle.kind === "resize" ? RESIZE_CURSORS[handle.id] : "pointer");
        return;
    }
    setCursor(selectableAt(scene) ? "move" : "default");
}
