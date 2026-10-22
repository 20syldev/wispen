"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useRef, useState } from "react";

import { KeyLabel } from "@/components/key";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useStore } from "@/hooks/useStore";
import { getCommands } from "@/lib/editor/commands";
import { rememberFocus, restoreFocus } from "@/lib/editor/focus";
import { formatShortcut, isApple } from "@/lib/editor/shortcuts";
import { getTools, localize } from "@/lib/registry";
import { foldText } from "@/lib/search";
import { editorStore, openDialog } from "@/lib/stores/editor";
import { localeStore } from "@/lib/stores/locale";
import { cn } from "@/lib/utils";
import type { CommandGroup } from "@/types/plugin";
import type { Locale } from "@/types/settings";

type GestureSection = "navigate" | "draw" | "select" | "write";

type SectionId = "tools" | Exclude<CommandGroup, "tool"> | GestureSection;

type Combo = string[];

interface Gesture {
    section: GestureSection;
    id: string;
    combos: Combo[];
}

interface CapTranslator {
    (key: string): string;
    has: (key: string) => boolean;
}

interface ShortcutRow {
    id: string;
    section: SectionId;
    label: string;
    combos: Combo[];
}

const SECTION_ORDER: SectionId[] = [
    "tools",
    "file",
    "edit",
    "arrange",
    "text",
    "view",
    "page",
    "plugin",
    "navigate",
    "draw",
    "select",
    "write",
];

// Canvas gestures that are not commands; tokens are key names, or mouse actions prefixed with "@".
const GESTURES: Gesture[] = [
    {
        section: "navigate",
        id: "pan",
        combos: [
            ["space", "@drag"],
            ["@middleClick", "@drag"],
        ],
    },
    { section: "navigate", id: "scroll", combos: [["@wheel"]] },
    { section: "navigate", id: "scrollHorizontal", combos: [["shift", "@wheel"]] },
    { section: "navigate", id: "zoom", combos: [["mod", "@wheel"], ["@pinch"]] },
    { section: "draw", id: "constrain", combos: [["shift", "@drag"]] },
    { section: "draw", id: "fromCenter", combos: [["alt", "@drag"]] },
    { section: "draw", id: "invertSnap", combos: [["mod", "@drag"]] },
    { section: "select", id: "addToSelection", combos: [["shift", "@click"]] },
    { section: "select", id: "duplicateDrag", combos: [["alt", "@drag"]] },
    { section: "select", id: "axisDrag", combos: [["shift", "@drag"]] },
    { section: "select", id: "nudge", combos: [["arrows"]] },
    { section: "select", id: "nudgeFar", combos: [["shift", "arrows"]] },
    { section: "select", id: "escape", combos: [["escape"]] },
    { section: "select", id: "copy", combos: [["mod", "c"]] },
    { section: "select", id: "cut", combos: [["mod", "x"]] },
    { section: "select", id: "paste", combos: [["mod", "v"]] },
    { section: "write", id: "editText", combos: [["@doubleClick"]] },
    { section: "write", id: "editSelected", combos: [["enter"]] },
    { section: "write", id: "finishText", combos: [["mod", "enter"], ["escape"]] },
];

/**
 * Converts one token of a gesture or shortcut to the label printed on its key cap, before
 * translation: "mod" becomes Cmd or Ctrl depending on the platform, named keys get the ASCII
 * names of formatShortcut.
 *
 * @param token - Key name ("shift", "c", "arrows") or mouse action prefixed with "@"
 * @returns The untranslated label, still prefixed with "@" for mouse actions
 */
function tokenLabel(token: string): string {
    if (token.startsWith("@")) return token;
    if (token === "mod") return isApple() ? "Cmd" : "Ctrl";
    return formatShortcut(token)[0];
}

/**
 * Translates the label of a key cap: named keys (Shift, Esc, Enter...) and mouse actions get
 * their localized name, single characters and Ctrl, Cmd or Alt stay as they are.
 *
 * @param label - Label from tokenLabel or formatShortcut, "@" prefixed for mouse actions
 * @param t - Translator of the "shortcuts" namespace
 * @returns The text printed on the key cap
 */
function capText(label: string, t: CapTranslator): string {
    const mouse = label.startsWith("@");
    const name = mouse ? label.slice(1) : label;
    const path = mouse ? `mouse.${name}` : `keys.${name}`;
    return /^[A-Za-z]{2,}$/.test(name) && t.has(path) ? t(path) : name;
}

/**
 * Collects every row of the dialog: tool keys, command shortcuts grouped by command group, then
 * the canvas gestures that are not commands. Commands without a shortcut are left out.
 *
 * @param locale - Locale used to resolve the labels of tools and commands
 * @param gestureLabel - Translates the id of a canvas gesture
 * @returns Rows in display order within each section
 */
function collectRows(locale: Locale, gestureLabel: (id: string) => string): ShortcutRow[] {
    const rows: ShortcutRow[] = [];

    for (const tool of getTools()) {
        if (!tool.shortcuts?.length) continue;
        rows.push({
            id: `tool:${tool.id}`,
            section: "tools",
            label: localize(tool.label, locale),
            combos: tool.shortcuts.map((shortcut) => formatShortcut(shortcut)),
        });
    }

    for (const command of getCommands()) {
        if (!command.shortcuts?.length) continue;
        rows.push({
            id: `command:${command.id}`,
            section: command.group === "tool" ? "tools" : command.group,
            label: localize(command.label, locale),
            combos: command.shortcuts.map((shortcut) => formatShortcut(shortcut)),
        });
    }

    for (const gesture of GESTURES) {
        rows.push({
            id: `gesture:${gesture.id}`,
            section: gesture.section,
            label: gestureLabel(gesture.id),
            combos: gesture.combos.map((combo) => combo.map(tokenLabel)),
        });
    }
    return rows;
}

/**
 * Key cap of the shortcut lists: a solid chip for a key, a dashed one for a mouse action, both
 * translated (Shift becomes Maj in French, Drag becomes Glisser).
 *
 * @param label - Label from tokenLabel or formatShortcut, "@" prefixed for mouse actions
 * @param className - Extra classes, e.g. to shrink the cap inside a tooltip
 * @returns The key cap
 */
function KeyCap({ label, className }: { label: string; className?: string }) {
    const t = useTranslations("shortcuts");
    const mouse = label.startsWith("@");

    return (
        <Kbd
            className={cn(
                "h-5.5 min-w-5.5 px-1.5 text-[11px] font-medium tabular-nums",
                mouse && "border-dashed font-sans",
                className,
            )}
        >
            <KeyLabel label={label}>{capText(label, t)}</KeyLabel>
        </Kbd>
    );
}

/**
 * Keys of a shortcut as a group of key caps, translated to the active locale.
 *
 * @param shortcut - Shortcut definition such as "mod+shift+z", as stored on commands and tools
 * @param className - Extra classes for each key cap
 * @returns One key cap per key, modifiers first
 */
export function ShortcutKeys({ shortcut, className }: { shortcut: string; className?: string }) {
    return (
        <KbdGroup>
            {formatShortcut(shortcut).map((label, index) => (
                <KeyCap key={index} label={label} className={className} />
            ))}
        </KbdGroup>
    );
}

/**
 * Keys of a shortcut as plain text joined with "+", for menus where key caps would be too
 * heavy ("Ctrl+Maj+Z").
 *
 * @param shortcut - Shortcut definition such as "mod+shift+z"
 * @returns The joined key names, as text
 */
export function ShortcutText({ shortcut }: { shortcut: string }) {
    const t = useTranslations("shortcuts");
    return (
        <>
            {formatShortcut(shortcut)
                .map((label) => capText(label, t))
                .join("+")}
        </>
    );
}

/**
 * One line of the dialog: what the shortcut does on the left, its alternatives on the right.
 *
 * @param label - Localized description of what the shortcut does
 * @param combos - Alternative key combinations, each a list of key cap labels
 * @param or - Translated word separating the alternatives
 * @returns The list item
 */
function Row({ label, combos, or }: { label: string; combos: Combo[]; or: string }) {
    return (
        <li className="flex min-h-9 items-center justify-between gap-4 border-b border-(--ov-line) py-1.5 last:border-b-0">
            <span className="min-w-0 text-[13px] leading-snug text-foreground">{label}</span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                {combos.map((combo, index) => (
                    <Fragment key={index}>
                        {index > 0 && <span className="text-xs text-muted-foreground">{or}</span>}
                        <KbdGroup>
                            {combo.map((cap, key) => (
                                <KeyCap key={key} label={cap} />
                            ))}
                        </KbdGroup>
                    </Fragment>
                ))}
            </span>
        </li>
    );
}

/**
 * Searchable list of every keyboard shortcut and canvas gesture, mounted only while the dialog
 * is open so the search starts empty each time.
 *
 * @returns The search field and the sections of shortcuts, or a message when nothing matches
 */
function ShortcutsList() {
    const t = useTranslations("shortcuts");
    const locale = useStore(localeStore, (state) => state.locale);
    const [query, setQuery] = useState("");

    const rows = useMemo(() => collectRows(locale, (id) => t(`gestures.${id}`)), [locale, t]);

    const sections = useMemo(() => {
        const folded = foldText(query.trim());
        const visible = rows.filter((row) => {
            if (!folded) return true;
            const keys = row.combos.flat().map((label) => capText(label, t));
            const haystack = [row.label, t(`groups.${row.section}`), ...keys].join(" ");
            return foldText(haystack).includes(folded);
        });
        return SECTION_ORDER.map((id) => ({
            id,
            rows: visible.filter((row) => row.section === id),
        })).filter((section) => section.rows.length > 0);
    }, [rows, query, t]);

    return (
        <>
            <div className="px-6 pb-4">
                <div className="overlay-field relative">
                    <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t("search")}
                        aria-label={t("search")}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-10 border-0 bg-transparent pl-9 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                    />
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-(--ov-line) px-6 pt-5 pb-6">
                {sections.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                        {t("empty", { query: query.trim() })}
                    </p>
                ) : (
                    <div className="columns-1 gap-x-10 md:columns-2">
                        {sections.map((section) => (
                            <section key={section.id} className="mb-6 break-inside-avoid">
                                <h3 className="overlay-label mb-1 px-0! pt-0!">
                                    {t(`groups.${section.id}`)}
                                </h3>
                                <ul>
                                    {section.rows.map((row) => (
                                        <Row
                                            key={row.id}
                                            label={row.label}
                                            combos={row.combos}
                                            or={t("or")}
                                        />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

/**
 * Keyboard shortcuts dialog, opened with "?" or from the palette and the help button: tools,
 * commands and canvas gestures in two columns, filtered by a search field that ignores accents.
 * The search field takes the focus on opening, and the focus goes back where it was on closing.
 *
 * @returns The dialog, rendered by Radix only while it is open
 */
export function ShortcutsDialog() {
    const t = useTranslations("shortcuts");
    const tc = useTranslations("common");
    const open = useStore(editorStore, (state) => state.dialog === "shortcuts");
    const returnFocus = useRef<HTMLElement | SVGElement | null>(null);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && openDialog(null)}>
            <DialogContent
                showCloseButton={false}
                onOpenAutoFocus={(event) => {
                    rememberFocus(returnFocus);
                    event.preventDefault();
                    if (event.currentTarget instanceof HTMLElement) {
                        event.currentTarget.querySelector("input")?.focus();
                    }
                }}
                onCloseAutoFocus={(event) => restoreFocus(event, returnFocus)}
                className="flex max-h-[min(88dvh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
            >
                <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
                    <DialogHeader className="gap-1.5 text-left">
                        <DialogTitle>{t("title")}</DialogTitle>
                        <DialogDescription>{t("description")}</DialogDescription>
                    </DialogHeader>
                    <DialogClose
                        aria-label={tc("close")}
                        className="overlay-close -mt-1 -mr-2 shrink-0"
                    >
                        <X className="size-4" />
                    </DialogClose>
                </div>
                <ShortcutsList />
            </DialogContent>
        </Dialog>
    );
}
