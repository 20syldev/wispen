"use client";

import { useTranslations } from "next-intl";
import {
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    useEffect,
    useMemo,
    useRef,
} from "react";

import { TextEditor } from "@/components/canvas/edit";
import { Grid } from "@/components/canvas/grid";
import { Overlay } from "@/components/canvas/overlay";
import { Scene } from "@/components/canvas/scene";
import { useActivePage, useSelectedElements, useViewport } from "@/hooks/useScene";
import { useStore } from "@/hooks/useStore";
import { screenContext } from "@/lib/canvas/colors";
import { screenToScene } from "@/lib/canvas/geometry";
import {
    doubleClick,
    pointerCancel,
    pointerDown,
    type PointerInput,
    pointerMove,
    pointerUp,
    wheel,
} from "@/lib/canvas/interaction";
import { importFiles } from "@/lib/storage/importing";
import { type CursorName, editorStore } from "@/lib/stores/editor";
import { cn } from "@/lib/utils";

// Cursor utilities spelled out in full so Tailwind generates every one of them.
const CURSOR_CLASSES: Record<CursorName, string> = {
    default: "cursor-default",
    crosshair: "cursor-crosshair",
    grab: "cursor-grab",
    grabbing: "cursor-grabbing",
    move: "cursor-move",
    text: "cursor-text",
    pointer: "cursor-pointer",
    "ew-resize": "cursor-ew-resize",
    "ns-resize": "cursor-ns-resize",
    "nwse-resize": "cursor-nwse-resize",
    "nesw-resize": "cursor-nesw-resize",
};

/**
 * Converts a DOM pointer event to the editor input, relative to the canvas.
 *
 * @param event - React pointer or mouse event from the canvas
 * @param element - Canvas element the coordinates are measured from
 * @returns The normalized input
 */
function toInput(event: ReactPointerEvent | ReactMouseEvent, element: Element): PointerInput {
    const rect = element.getBoundingClientRect();
    const pointer = event as ReactPointerEvent;
    return {
        screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        pointerId: pointer.pointerId ?? 1,
        pointerType: pointer.pointerType ?? "mouse",
        button: event.button,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        modKey: event.ctrlKey || event.metaKey,
    };
}

/**
 * Infinite drawing surface: the grid, the elements of the active page and the editing overlay
 * in one SVG, plus the in-place text editor. Pointer, wheel and drop events are forwarded to the
 * interaction engine in lib/canvas/interaction.ts. The surface is focusable, with a visible ring
 * for keyboard users only.
 *
 * @returns The canvas layer, filling its parent
 */
export function Canvas() {
    const t = useTranslations("common");
    const svgRef = useRef<SVGSVGElement>(null);
    const page = useActivePage();
    const viewport = useViewport();
    const selected = useSelectedElements();
    const editingId = useStore(editorStore, (state) => state.editingId);
    const cursor = useStore(editorStore, (state) => state.cursor);
    const marquee = useStore(editorStore, (state) => state.marquee);
    const bindingTargetId = useStore(editorStore, (state) => state.bindingTargetId);
    const erasing = useStore(editorStore, (state) => state.erasingIds);
    const settings = useStore(editorStore, (state) => state.settings);
    const fontsVersion = useStore(editorStore, (state) => state.fontsVersion);

    const ctx = useMemo(() => {
        void fontsVersion;
        return screenContext(editingId);
    }, [editingId, fontsVersion]);
    const erasingIds = useMemo(() => new Set(erasing), [erasing]);
    const bindingTarget = bindingTargetId
        ? (page.elements.find((el) => el.id === bindingTargetId) ?? null)
        : null;

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const observer = new ResizeObserver(([entry]) => {
            editorStore.setState({
                canvasSize: { width: entry.contentRect.width, height: entry.contentRect.height },
            });
        });
        observer.observe(svg);

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = svg.getBoundingClientRect();
            wheel({
                screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
                deltaX: event.deltaX,
                deltaY: event.deltaY,
                lines: event.deltaMode === 1,
                shiftKey: event.shiftKey,
                modKey: event.ctrlKey || event.metaKey,
            });
        };
        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            observer.disconnect();
            svg.removeEventListener("wheel", onWheel);
        };
    }, []);

    return (
        <div
            className="paper-grain absolute inset-0 touch-none overflow-hidden bg-canvas select-none"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault();
                const files = Array.from(event.dataTransfer.files);
                if (files.length === 0 || !svgRef.current) return;
                const input = toInput(event, svgRef.current);
                void importFiles(files, screenToScene(input.screen, viewport));
            }}
        >
            <svg
                ref={svgRef}
                role="application"
                aria-label={t("canvasLabel")}
                tabIndex={0}
                className={cn(
                    "absolute inset-0 size-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    CURSOR_CLASSES[cursor],
                )}
                onPointerDown={(event) => {
                    if (event.button !== 2) event.currentTarget.setPointerCapture(event.pointerId);
                    pointerDown(toInput(event, event.currentTarget));
                }}
                onPointerMove={(event) => pointerMove(toInput(event, event.currentTarget))}
                onPointerUp={(event) => pointerUp(toInput(event, event.currentTarget))}
                onPointerCancel={(event) => pointerCancel(toInput(event, event.currentTarget))}
                onLostPointerCapture={(event) => pointerCancel(toInput(event, event.currentTarget))}
                onDoubleClick={(event) => doubleClick(toInput(event, event.currentTarget))}
            >
                {settings.showGrid && (
                    <Grid viewport={viewport} type={settings.gridType} size={settings.gridSize} />
                )}
                <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
                    <Scene elements={page.elements} ctx={ctx} erasingIds={erasingIds} />
                    <Overlay
                        selected={selected}
                        zoom={viewport.zoom}
                        marquee={marquee}
                        bindingTarget={bindingTarget}
                        editing={editingId !== null}
                    />
                </g>
            </svg>
            <TextEditor />
        </div>
    );
}
