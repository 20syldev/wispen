"use client";

import { ChevronDown, Lock, LockOpen, Shapes } from "lucide-react";
import { useTranslations } from "next-intl";
import { Toolbar as ToolbarPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";

import { Island } from "@/components/island";
import { FocusGuard } from "@/components/panel/focus";
import { Tip } from "@/components/panel/tip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/hooks/useStore";
import { toggleToolLock } from "@/lib/editor/actions";
import { activateTool } from "@/lib/editor/api";
import { getCommands } from "@/lib/editor/commands";
import { formatShortcut } from "@/lib/editor/shortcuts";
import { getTools, localize } from "@/lib/registry";
import { editorStore } from "@/lib/stores/editor";
import { localeStore } from "@/lib/stores/locale";
import { cn } from "@/lib/utils";
import type { ToolDefinition } from "@/types/plugin";

const BUTTON_CLASS =
    "group relative grid h-9 w-[34px] shrink-0 place-items-center rounded-dock-item text-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active=true]:text-mark";

const ICON_CLASS = "relative size-[18px] stroke-[1.75]";

/**
 * Picks the key hint printed in the corner of a tool button: the digit when the tool has one,
 * otherwise its first single-key shortcut.
 *
 * @param tool - Tool read for its shortcuts
 * @returns The key to print, or null when the tool has no single-key shortcut
 */
function keyHint(tool: ToolDefinition): string | null {
    const keys = (tool.shortcuts ?? []).filter((shortcut) => shortcut.length === 1);
    const key = keys.find((shortcut) => /^[0-9]$/.test(shortcut)) ?? keys[0];
    return key ? formatShortcut(key).join("") : null;
}

/**
 * Centered pill dock of drawing tools: one button per main tool with its key hint, a menu for
 * the extra tools contributed by plugins, and the "keep tool active" toggle. A single pill
 * glides behind the active tool, whose icon turns vermilion, and a lighter pill follows the
 * pointer. It is a single tab stop whose buttons are reached with the arrow keys, and it scrolls
 * horizontally inside itself on narrow screens, fading the edge that hides more tools; the
 * active tool is kept in view by scrolling the dock itself, since scrollIntoView would also
 * scroll the clipped editor container. A tool picked from the menu with the pointer does not
 * send the focus back to the menu button, so arrow keys go on nudging the selection.
 *
 * @returns The dock, wrapped in a focus guard that leaves the focus on the canvas for pointer
 * users
 */
export function Toolbar() {
    const t = useTranslations("toolbar");
    const locale = useStore(localeStore, (state) => state.locale);
    const active = useStore(editorStore, (state) => state.tool);
    const locked = useStore(editorStore, (state) => state.toolLocked);
    const scrollRef = useRef<HTMLDivElement>(null);
    const menuByPointer = useRef(false);
    const [edges, setEdges] = useState({ start: false, end: false });

    const tools = getTools();
    const main = tools.filter((tool) => tool.placement !== "more");
    const more = tools.filter((tool) => tool.placement === "more");
    const activeMore = more.find((tool) => tool.id === active);
    const MoreIcon = activeMore?.icon ?? Shapes;
    const lockShortcuts = getCommands().find((command) => command.id === "tool-lock")?.shortcuts;

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        const update = () => {
            const start = element.scrollLeft > 1;
            const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
            setEdges((current) =>
                current.start === start && current.end === end ? current : { start, end },
            );
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        element.addEventListener("scroll", update, { passive: true });
        return () => {
            observer.disconnect();
            element.removeEventListener("scroll", update);
        };
    }, []);

    useEffect(() => {
        const element = scrollRef.current;
        const button = element?.querySelector('[data-active="true"]');
        if (!element || !button) return;
        const frame = element.getBoundingClientRect();
        const box = button.getBoundingClientRect();
        if (box.left < frame.left + 8) element.scrollLeft -= frame.left + 8 - box.left;
        else if (box.right > frame.right - 8) element.scrollLeft += box.right - (frame.right - 8);
    }, [active]);

    return (
        <FocusGuard>
            <ToolbarPrimitive.Root asChild aria-label={t("label")} loop>
                <Island
                    ref={scrollRef}
                    data-toolbar-dock=""
                    className={cn(
                        "glide flex max-w-full min-w-0 items-center gap-px overflow-x-auto overscroll-x-contain rounded-dock! px-1.5 py-1 scrollbar-none",
                        edges.end && "mask-r-from-[calc(100%-40px)]",
                        edges.start && "mask-l-from-[calc(100%-40px)]",
                    )}
                >
                    {main.map((tool) => {
                        const Icon = tool.icon;
                        const label = localize(tool.label, locale);
                        const pressed = !tool.run && tool.id === active;
                        const hint = keyHint(tool);
                        return (
                            <Tip
                                key={tool.id}
                                label={label}
                                shortcuts={tool.shortcuts}
                                side="bottom"
                            >
                                <ToolbarPrimitive.Button
                                    aria-label={label}
                                    aria-pressed={tool.run ? undefined : pressed}
                                    aria-keyshortcuts={tool.shortcuts
                                        ?.map((shortcut) => formatShortcut(shortcut).join("+"))
                                        .join(" ")}
                                    data-active={pressed}
                                    onClick={() => activateTool(tool.id)}
                                    className={BUTTON_CLASS}
                                >
                                    <Icon className={ICON_CLASS} />
                                    {hint && (
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute right-[3px] bottom-[2px] font-num text-[9px] leading-none font-medium text-muted-foreground tabular-nums group-data-[active=true]:text-foreground"
                                        >
                                            {hint}
                                        </span>
                                    )}
                                </ToolbarPrimitive.Button>
                            </Tip>
                        );
                    })}

                    {more.length > 0 && (
                        <DropdownMenu>
                            <Tip
                                label={activeMore ? localize(activeMore.label, locale) : t("more")}
                                side="bottom"
                            >
                                <DropdownMenuTrigger
                                    asChild
                                    onPointerDown={() => (menuByPointer.current = true)}
                                    onKeyDown={() => (menuByPointer.current = false)}
                                >
                                    <ToolbarPrimitive.Button
                                        aria-label={
                                            activeMore
                                                ? t("moreActive", {
                                                      tool: localize(activeMore.label, locale),
                                                  })
                                                : t("more")
                                        }
                                        data-active={Boolean(activeMore)}
                                        className={BUTTON_CLASS}
                                    >
                                        <MoreIcon className={ICON_CLASS} />
                                        <ChevronDown
                                            aria-hidden="true"
                                            className="pointer-events-none absolute right-[3px] bottom-[3px] size-2.5 stroke-[2.25] text-muted-foreground group-data-[active=true]:text-foreground"
                                        />
                                    </ToolbarPrimitive.Button>
                                </DropdownMenuTrigger>
                            </Tip>
                            <DropdownMenuContent
                                side="bottom"
                                align="center"
                                sideOffset={10}
                                className="min-w-56 rounded-lg p-1 shadow-lg"
                                onKeyDown={() => (menuByPointer.current = false)}
                                onPointerMove={() => (menuByPointer.current = true)}
                                onCloseAutoFocus={(event) => {
                                    if (menuByPointer.current) event.preventDefault();
                                }}
                            >
                                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                                    {t("moreTitle")}
                                </DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={activeMore?.id ?? ""}
                                    onValueChange={(id) => activateTool(id)}
                                >
                                    {more.map((tool) => {
                                        const Icon = tool.icon;
                                        const hint = keyHint(tool);
                                        return (
                                            <DropdownMenuRadioItem
                                                key={tool.id}
                                                value={tool.id}
                                                className="h-9 rounded-sm [--overlay-pad-end:2rem] [--overlay-pad:0.625rem] [--ov-ind-left:auto] [--ov-ind-right:0.625rem] [&>span:first-child]:text-mark"
                                            >
                                                <Icon className="size-4 stroke-[1.75]" />
                                                {localize(tool.label, locale)}
                                                {hint && (
                                                    <DropdownMenuShortcut className="font-num tabular-nums">
                                                        {hint}
                                                    </DropdownMenuShortcut>
                                                )}
                                            </DropdownMenuRadioItem>
                                        );
                                    })}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    <ToolbarPrimitive.Separator className="mx-1 h-5 w-px shrink-0 bg-border" />

                    <Tip label={t("lockHint")} shortcuts={lockShortcuts} side="bottom">
                        <ToolbarPrimitive.Button
                            aria-label={t("lock")}
                            aria-pressed={locked}
                            onClick={() => toggleToolLock()}
                            className={cn(BUTTON_CLASS, "aria-pressed:bg-(--ov-hover)")}
                        >
                            {locked && <span className="toggle-dot" />}
                            {locked ? (
                                <Lock className={ICON_CLASS} />
                            ) : (
                                <LockOpen className={ICON_CLASS} />
                            )}
                        </ToolbarPrimitive.Button>
                    </Tip>
                </Island>
            </ToolbarPrimitive.Root>
        </FocusGuard>
    );
}
