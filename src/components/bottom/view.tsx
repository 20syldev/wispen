"use client";

import { CircleHelp, Grid3x3, type LucideIcon, Magnet } from "lucide-react";
import { useTranslations } from "next-intl";

import { Island } from "@/components/island";
import { Hint } from "@/components/top/actions";
import { useStore } from "@/hooks/useStore";
import { runCommand } from "@/lib/editor/commands";
import { editorStore } from "@/lib/stores/editor";
import { cn } from "@/lib/utils";

/**
 * Labelled on/off button of the view dock. When on, it gets the accent surface and the marker
 * dot of the identity; below 880px only the icon remains, named by its aria-label.
 *
 * @param icon - Lucide icon drawn before the label
 * @param label - Short visible name, also the accessible name
 * @param hint - Longer tooltip text describing the effect
 * @param command - Command id run on click, whose shortcut the tooltip shows
 * @param pressed - Current state, exposed through aria-pressed
 * @returns The toggle button wrapped in its tooltip
 */
function ViewToggle({
    icon: Icon,
    label,
    hint,
    command,
    pressed,
}: {
    icon: LucideIcon;
    label: string;
    hint: string;
    command: string;
    pressed: boolean;
}) {
    return (
        <Hint label={hint} command={command} side="top">
            <button
                type="button"
                aria-label={label}
                aria-pressed={pressed}
                onClick={() => runCommand(command)}
                className={cn(
                    "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-dock-item pr-3 pl-[9px] text-[12.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-[880px]:w-8 max-[880px]:justify-center max-[880px]:p-0",
                    pressed && "bg-accent text-foreground hover:bg-accent",
                )}
            >
                {pressed && <span aria-hidden="true" className="toggle-dot" />}
                <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="max-[880px]:hidden">{label}</span>
            </button>
        </Hint>
    );
}

/**
 * Bottom-right dock: grid and snapping toggles, then the help button opening the keyboard
 * shortcuts dialog.
 *
 * @returns The view dock
 */
export function ViewControls() {
    const t = useTranslations("menu");
    const showGrid = useStore(editorStore, (state) => state.settings.showGrid);
    const snapToGrid = useStore(editorStore, (state) => state.settings.snapToGrid);

    return (
        <Island
            role="group"
            aria-label={t("view")}
            className="flex items-center gap-0.5 rounded-dock p-[3px]"
        >
            <ViewToggle
                icon={Grid3x3}
                label={t("grid")}
                hint={t("gridHint")}
                command="toggle-grid"
                pressed={showGrid}
            />
            <ViewToggle
                icon={Magnet}
                label={t("snap")}
                hint={t("snapHint")}
                command="toggle-snap"
                pressed={snapToGrid}
            />
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
            <Hint label={t("help")} command="shortcuts" side="top">
                <button
                    type="button"
                    aria-label={t("help")}
                    onClick={() => runCommand("shortcuts")}
                    className="grid size-8 shrink-0 place-items-center rounded-dock-item text-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                    <CircleHelp className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
                </button>
            </Hint>
        </Island>
    );
}
