"use client";

import { ChevronUp, Focus, Maximize, Minus, Percent, Plus, Redo2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Island } from "@/components/island";
import { commandShortcut, Hint, Keys } from "@/components/top/actions";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/hooks/useStore";
import { runCommand } from "@/lib/editor/commands";
import { documentStore } from "@/lib/stores/document";
import { DEFAULT_VIEWPORT, editorStore } from "@/lib/stores/editor";

const DOCK_BUTTON_CLASS =
    "grid size-8 shrink-0 place-items-center rounded-dock-item text-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45";

/**
 * Bottom-left docks: zoom out, the zoom level (click to go back to 100 %), zoom in and a menu
 * to fit the page or the selection; then undo and redo, disabled when the history is empty and
 * hidden below 420px, where the bottom row has no room left for them.
 *
 * @returns The zoom dock and the history dock
 */
export function ZoomControls() {
    const t = useTranslations("zoom");
    const pageId = useStore(documentStore, ({ document }) =>
        document.pages.some((p) => p.id === document.activePageId)
            ? document.activePageId
            : document.pages[0].id,
    );
    const zoom = useStore(
        editorStore,
        (state) => (state.viewports[pageId] ?? DEFAULT_VIEWPORT).zoom,
    );
    const canUndo = useStore(documentStore, (state) => state.past.length > 0);
    const canRedo = useStore(documentStore, (state) => state.future.length > 0);
    const hasSelection = useStore(editorStore, (state) => state.selectedIds.length > 0);
    const percent = Math.round(zoom * 100);

    return (
        <div className="flex items-end gap-2">
            <Island
                role="group"
                aria-label={t("zoom")}
                className="flex items-center gap-0.5 rounded-dock p-[3px]"
            >
                <Hint label={t("zoomOut")} command="zoom-out" side="top">
                    <button
                        type="button"
                        aria-label={t("zoomOut")}
                        onClick={() => runCommand("zoom-out")}
                        className={DOCK_BUTTON_CLASS}
                    >
                        <Minus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </Hint>
                <Hint label={t("reset")} command="zoom-reset" side="top">
                    <button
                        type="button"
                        aria-label={t("levelLabel", { value: percent })}
                        onClick={() => runCommand("zoom-reset")}
                        className="h-8 min-w-[58px] shrink-0 rounded-dock-item px-1.5 font-num text-[12.5px] font-medium text-foreground tabular-nums hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                        {t("level", { value: percent })}
                    </button>
                </Hint>
                <Hint label={t("zoomIn")} command="zoom-in" side="top">
                    <button
                        type="button"
                        aria-label={t("zoomIn")}
                        onClick={() => runCommand("zoom-in")}
                        className={DOCK_BUTTON_CLASS}
                    >
                        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </Hint>
                <DropdownMenu>
                    <Hint label={t("options")} side="top">
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label={t("options")}
                                className="grid h-8 w-6 shrink-0 place-items-center rounded-dock-item text-muted-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            >
                                <ChevronUp
                                    className="size-3.5"
                                    strokeWidth={2}
                                    aria-hidden="true"
                                />
                            </button>
                        </DropdownMenuTrigger>
                    </Hint>
                    <DropdownMenuContent
                        side="top"
                        align="start"
                        sideOffset={10}
                        collisionPadding={12}
                        className="min-w-60 rounded-lg border-border/80 p-1.5 whitespace-nowrap shadow-lg"
                    >
                        <DropdownMenuItem onSelect={() => runCommand("zoom-fit")}>
                            <Maximize strokeWidth={1.75} />
                            {t("fit")}
                            <Keys shortcut={commandShortcut("zoom-fit")} className="ml-auto" />
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={!hasSelection}
                            onSelect={() => runCommand("zoom-selection")}
                        >
                            <Focus strokeWidth={1.75} />
                            {t("selection")}
                            <Keys
                                shortcut={commandShortcut("zoom-selection")}
                                className="ml-auto"
                            />
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => runCommand("zoom-reset")}>
                            <Percent strokeWidth={1.75} />
                            {t("reset")}
                            <Keys shortcut={commandShortcut("zoom-reset")} className="ml-auto" />
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </Island>

            <Island
                role="group"
                aria-label={t("history")}
                className="flex items-center gap-0.5 rounded-dock p-[3px] max-[420px]:hidden"
            >
                <Hint label={t("undo")} command="undo" side="top">
                    <button
                        type="button"
                        aria-label={t("undo")}
                        disabled={!canUndo}
                        onClick={() => runCommand("undo")}
                        className={DOCK_BUTTON_CLASS}
                    >
                        <Undo2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </Hint>
                <Hint label={t("redo")} command="redo" side="top">
                    <button
                        type="button"
                        aria-label={t("redo")}
                        disabled={!canRedo}
                        onClick={() => runCommand("redo")}
                        className={DOCK_BUTTON_CLASS}
                    >
                        <Redo2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </Hint>
            </Island>
        </div>
    );
}
