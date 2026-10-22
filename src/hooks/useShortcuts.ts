"use client";

import { useEffect } from "react";

import { cancelGesture, isInteracting, setSpacePressed } from "@/lib/canvas/interaction";
import { nudgeSelection, startEditing } from "@/lib/editor/actions";
import { activateTool, editorApi } from "@/lib/editor/api";
import { copySelection, cutSelection, pasteFromEvent } from "@/lib/editor/clipboard";
import { getCommands } from "@/lib/editor/commands";
import { isTypingTarget, matchShortcut } from "@/lib/editor/shortcuts";
import { getShape, getTools } from "@/lib/registry";
import { getSelectedElements } from "@/lib/stores/document";
import { editorStore, setSelection, setTool } from "@/lib/stores/editor";

// Arrow keys and the offset they move the selection by, in scene pixels.
const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
};

/**
 * Tells whether a keyboard event comes from an open dialog, menu or list, which handle their
 * own keys (typeahead, Escape, arrows).
 *
 * @param target - Target of the keyboard or clipboard event, possibly null or a text node
 * @returns true when shortcuts must stay quiet
 */
function insideOverlay(target: EventTarget | null): boolean {
    return (
        target instanceof Element &&
        target.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]') !==
            null
    );
}

/**
 * Handles Escape: cancels a gesture, then clears the selection, then goes back to selection.
 */
function escape(): void {
    if (cancelGesture()) return;
    const { selectedIds, tool } = editorStore.getState();
    if (selectedIds.length > 0) setSelection([]);
    else if (tool !== "select") setTool("select");
}

/**
 * Global keyboard handling: commands with their shortcuts, tool keys, arrow nudging, Enter to
 * edit text, the space bar for panning, and clipboard events. Keys typed into fields, dialogs
 * and menus are left alone.
 */
export function useShortcuts(): void {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented ||
                isTypingTarget(event.target) ||
                insideOverlay(event.target)
            )
                return;
            if (editorStore.getState().dialog || editorStore.getState().editingId) return;

            if (event.key === " ") {
                event.preventDefault();
                if (!event.repeat) setSpacePressed(true);
                return;
            }
            if (event.key === "Escape") {
                escape();
                return;
            }
            if (isInteracting()) return;

            for (const command of getCommands()) {
                const shortcut = command.shortcuts?.find((candidate) =>
                    matchShortcut(event, candidate),
                );
                if (!shortcut || (command.enabled && !command.enabled(editorApi))) continue;
                event.preventDefault();
                void command.run(editorApi);
                return;
            }

            const arrow = ARROWS[event.key];
            if (arrow && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                const { snapToGrid, gridSize } = editorStore.getState().settings;
                const step = event.shiftKey
                    ? snapToGrid
                        ? gridSize
                        : 10
                    : snapToGrid
                      ? gridSize
                      : 1;
                nudgeSelection(arrow[0] * step, arrow[1] * step);
                return;
            }

            if (event.key === "Enter") {
                const selected = getSelectedElements();
                if (selected.length === 1 && getShape(selected[0].type).text) {
                    event.preventDefault();
                    startEditing(selected[0].id);
                }
                return;
            }

            const tool = getTools().find((candidate) =>
                candidate.shortcuts?.some((key) => matchShortcut(event, key)),
            );
            if (tool) {
                event.preventDefault();
                activateTool(tool.id);
            }
        };

        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === " ") setSpacePressed(false);
        };
        const onBlur = () => setSpacePressed(false);

        const editable = (event: Event) =>
            !isTypingTarget(event.target) &&
            !insideOverlay(event.target) &&
            !editorStore.getState().editingId &&
            !isTypingTarget(document.activeElement);
        const onCopy = (event: ClipboardEvent) => {
            if (editable(event)) copySelection(event);
        };
        const onCut = (event: ClipboardEvent) => {
            if (editable(event)) cutSelection(event);
        };
        const onPaste = (event: ClipboardEvent) => {
            if (editable(event) && pasteFromEvent(event)) event.preventDefault();
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        document.addEventListener("copy", onCopy);
        document.addEventListener("cut", onCut);
        document.addEventListener("paste", onPaste);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("copy", onCopy);
            document.removeEventListener("cut", onCut);
            document.removeEventListener("paste", onPaste);
        };
    }, []);
}
