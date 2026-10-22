"use client";

import { Download, Moon, Search, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { ReactElement } from "react";

import { Island } from "@/components/island";
import { KeyLabel } from "@/components/key";
import { Tip } from "@/components/panel/tip";
import { Kbd } from "@/components/ui/kbd";
import { getCommands, runCommand } from "@/lib/editor/commands";
import { formatShortcut } from "@/lib/editor/shortcuts";
import { cn } from "@/lib/utils";

export interface HintProps {
    label: string;
    command?: string;
    side?: "top" | "right" | "bottom" | "left";
    children: ReactElement;
}

/**
 * Returns the first keyboard shortcut of a command, read from the registry so labels follow any
 * change of the bindings.
 *
 * @param id - Command id, built-in or contributed by a plugin
 * @returns The shortcut definition such as "mod+k", or null when the command has none
 */
export function commandShortcut(id: string): string | null {
    return getCommands().find((command) => command.id === id)?.shortcuts?.[0] ?? null;
}

/**
 * Keyboard shortcut chip in the numeric face of the identity, with Cmd or Ctrl depending on the
 * platform. Renders nothing when the shortcut is missing.
 *
 * @param shortcut - Shortcut definition such as "mod+shift+e"
 * @param className - Extra classes, e.g. `ml-auto` inside a menu item
 * @returns The chip, or null without a shortcut
 */
export function Keys({ shortcut, className }: { shortcut: string | null; className?: string }) {
    if (!shortcut) return null;
    return (
        <Kbd
            className={cn(
                "h-5 shrink-0 px-1.5 font-num text-[11px] whitespace-nowrap tabular-nums",
                className,
            )}
        >
            {formatShortcut(shortcut).map((label, index) => (
                <KeyLabel key={index} label={label} />
            ))}
        </Kbd>
    );
}

/**
 * Tooltip of a chrome button bound to a command: the shared Tip of the editor chrome, fed with
 * the first shortcut of the command so every tooltip of the screen reads the same way.
 *
 * @param label - Tooltip text, already translated
 * @param command - Command id whose first shortcut is shown next to the label, none when omitted
 * @param side - Side of the trigger where the tooltip opens, bottom by default
 * @param children - Single element the tooltip is attached to, which must accept a ref
 * @returns The trigger wrapped in its tooltip
 */
export function Hint({ label, command, side = "bottom", children }: HintProps) {
    const shortcut = command ? commandShortcut(command) : null;

    return (
        <Tip label={label} shortcuts={shortcut ? [shortcut] : []} side={side}>
            {children}
        </Tip>
    );
}

/**
 * Top-right island: command palette trigger with its shortcut, light or dark theme switch, and
 * the primary "Exporter" pill, the one vermilion button of the screen. Below 560px the palette
 * trigger and the export button collapse to their icons.
 *
 * @returns The palette and theme island followed by the export button
 */
export function TopActions() {
    const t = useTranslations("menu");
    const { resolvedTheme } = useTheme();
    const dark = resolvedTheme === "dark";
    const themeLabel = dark ? t("themeToLight") : t("themeToDark");

    return (
        <div className="flex items-center gap-2">
            <Island className="flex items-center gap-0.5 p-1">
                <Hint label={t("palette")} command="command-palette">
                    <button
                        type="button"
                        aria-label={t("paletteOpen")}
                        onClick={() => runCommand("command-palette")}
                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md pr-1.5 pl-2.5 text-muted-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-[560px]:w-9 max-[560px]:justify-center max-[560px]:p-0"
                    >
                        <Search className="size-4" strokeWidth={1.75} aria-hidden="true" />
                        <Keys
                            shortcut={commandShortcut("command-palette")}
                            className="border border-border max-[560px]:hidden"
                        />
                    </button>
                </Hint>
                <Hint label={themeLabel} command="toggle-theme">
                    <button
                        type="button"
                        aria-label={themeLabel}
                        onClick={() => runCommand("toggle-theme")}
                        className="grid size-9 shrink-0 place-items-center rounded-md text-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                        {dark ? (
                            <Sun className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                            <Moon className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
                        )}
                    </button>
                </Hint>
            </Island>
            <Hint label={t("exportHint")} command="export">
                <button
                    type="button"
                    aria-label={t("export")}
                    onClick={() => runCommand("export")}
                    className="pointer-events-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-cta bg-primary pr-[18px] pl-[15px] text-[13.5px] font-semibold text-primary-foreground shadow-island inset-ring inset-ring-primary-foreground/15 transition-colors outline-none hover:bg-[color-mix(in_oklch,var(--primary)_86%,var(--foreground))] focus-visible:ring-[3px] focus-visible:ring-ring/50 max-[560px]:w-11 max-[560px]:justify-center max-[560px]:p-0"
                >
                    <Download className="size-4" strokeWidth={2} aria-hidden="true" />
                    <span className="max-[560px]:hidden">{t("export")}</span>
                </button>
            </Hint>
        </div>
    );
}
