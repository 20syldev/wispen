"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { type ComponentProps, type KeyboardEvent, type ReactNode, useId } from "react";

import { DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStore } from "@/hooks/useStore";
import { editorStore, updateSettings } from "@/lib/stores/editor";
import { cn } from "@/lib/utils";
import type { CanvasStyle } from "@/types/settings";

const THEMES = [
    { id: "light", Icon: Sun, label: "themeLight" },
    { id: "dark", Icon: Moon, label: "themeDark" },
    { id: "system", Icon: Monitor, label: "themeSystem" },
] as const;

const CANVASES = [
    { id: "white", label: "canvasWhite" },
    { id: "tinted", label: "canvasTinted" },
] as const;

interface SectionProps {
    id: string;
    label: string;
    children: ReactNode;
}

interface PaperProps {
    paper: CanvasStyle;
    dark: boolean;
}

/**
 * Moves the focus between the controls of the panel with the vertical arrow keys, towards the
 * nearest radio of the next row on screen, so the three groups form one keyboard path. The
 * horizontal arrows stay with the roving focus of each group. From the panel itself, as when the
 * submenu opens from the keyboard, the first or last radio takes the focus.
 *
 * @param event - Key down event bubbling from the panel
 */
function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
    const forward = event.key === "ArrowDown";
    if (!forward && event.key !== "ArrowUp") return;
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    event.preventDefault();
    const origin = radios.find((radio) => radio === event.target)?.getBoundingClientRect();
    if (!origin) {
        (forward ? radios[0] : radios.at(-1))?.focus();
        return;
    }
    const centre = origin.left + origin.width / 2;
    let best: HTMLElement | undefined;
    let bestScore = Infinity;
    for (const radio of radios) {
        const box = radio.getBoundingClientRect();
        const rows = forward ? box.top - origin.top : origin.top - box.top;
        if (rows < 1) continue;
        const score = rows * 1000 + Math.abs(box.left + box.width / 2 - centre);
        if (score < bestScore) {
            best = radio;
            bestScore = score;
        }
    }
    best?.focus();
}

/**
 * Titled block of the panel: a small caption naming the control that follows.
 *
 * @param id - Id of the caption, referenced by the control as its accessible name
 * @param label - Caption text
 * @param children - Control named by the caption, linked to it through aria-labelledby
 * @returns The captioned block
 */
function Section({ id, label, children }: SectionProps) {
    return (
        <div className="flex flex-col gap-2">
            <span id={id} className="px-0.5 text-xs font-medium text-muted-foreground">
                {label}
            </span>
            {children}
        </div>
    );
}

/**
 * Small sheet of paper standing for a canvas background: the pure white (or black) canvas, or the
 * tinted paper with its light grain.
 *
 * @param paper - Canvas background pictured
 * @param dark - Whether the dark tokens apply
 * @returns The decorative swatch
 */
function Paper({ paper, dark }: PaperProps) {
    return (
        <span
            aria-hidden="true"
            data-canvas={paper}
            className={cn(
                "relative size-4 shrink-0 overflow-hidden rounded-sm border border-input",
                paper === "white" ? "paper-white" : "paper-grain bg-canvas",
                dark && "dark",
            )}
        />
    );
}

/**
 * Content of the "Apparence" submenu: a three-way theme switch and a two-way canvas switch. Both
 * are single-choice toggle groups that cannot be emptied, so the menu stays open on selection; the
 * vertical arrows walk through the groups and the horizontal ones inside each. The panel scrolls
 * when the screen is short.
 *
 * @param className - Classes of the panel, shared with the other submenus
 * @param props - Placement props of the submenu content
 * @returns The submenu panel, to render inside a DropdownMenuSub
 */
export function Appearance({ className, ...props }: ComponentProps<typeof DropdownMenuSubContent>) {
    const t = useTranslations("menu");
    const { theme = "system", setTheme, resolvedTheme } = useTheme();
    const settings = useStore(editorStore, (state) => state.settings);
    const dark = resolvedTheme === "dark";
    const themeId = useId();
    const canvasId = useId();

    return (
        <DropdownMenuPortal>
            <DropdownMenuSubContent
                {...props}
                onKeyDown={moveFocus}
                className={cn(className, "w-[min(19rem,calc(100vw-24px))] p-3")}
            >
                <div className="flex flex-col gap-4">
                    <Section id={themeId} label={t("theme")}>
                        <ToggleGroup
                            type="single"
                            orientation="horizontal"
                            spacing={1}
                            value={theme}
                            onValueChange={(value) => {
                                if (value) setTheme(value);
                            }}
                            aria-labelledby={themeId}
                            className="glide glide-raised segment-track w-full"
                        >
                            {THEMES.map(({ id, Icon, label }) => (
                                <ToggleGroupItem key={id} value={id} className="segment-item">
                                    <Icon strokeWidth={1.75} aria-hidden="true" />
                                    {t(label)}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    </Section>

                    <Section id={canvasId} label={t("canvasStyle")}>
                        <ToggleGroup
                            type="single"
                            orientation="horizontal"
                            spacing={1}
                            value={settings.canvas}
                            onValueChange={(value) => {
                                if (value) updateSettings({ canvas: value as CanvasStyle });
                            }}
                            aria-labelledby={canvasId}
                            className="glide glide-raised segment-track w-full"
                        >
                            {CANVASES.map(({ id, label }) => (
                                <ToggleGroupItem key={id} value={id} className="segment-item">
                                    <Paper paper={id} dark={dark} />
                                    {t(label)}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    </Section>
                </div>
            </DropdownMenuSubContent>
        </DropdownMenuPortal>
    );
}
