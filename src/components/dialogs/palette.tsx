"use client";

import { Command as CommandPrimitive } from "cmdk";
import { ChevronRight, FileText, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ComponentType, useMemo, useRef, useState } from "react";

import { ShortcutKeys } from "@/components/dialogs/shortcuts";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/hooks/useStore";
import { activateTool, editorApi } from "@/lib/editor/api";
import { getCommands, runCommand } from "@/lib/editor/commands";
import { rememberFocus, restoreFocus } from "@/lib/editor/focus";
import { getTools, localize } from "@/lib/registry";
import { foldText } from "@/lib/search";
import { documentStore, setActivePage } from "@/lib/stores/document";
import { editorStore, openDialog } from "@/lib/stores/editor";
import { localeStore } from "@/lib/stores/locale";
import type { CommandGroup as CommandGroupName } from "@/types/plugin";
import type { Locale } from "@/types/settings";

type SectionId = "tools" | "pages" | Exclude<CommandGroupName, "tool">;

interface PaletteItem {
    value: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    shortcut?: string;
    active?: boolean;
    run: () => void;
}

interface PaletteSection {
    id: SectionId;
    items: PaletteItem[];
}

const SECTION_ORDER: SectionId[] = [
    "file",
    "edit",
    "tools",
    "arrange",
    "text",
    "view",
    "page",
    "pages",
    "plugin",
];

// Command ids left out of the palette entries.
const HIDDEN_COMMANDS = new Set(["command-palette"]);

/**
 * Scores a palette entry against the search: every word of the search must appear in the label
 * or the section name. Labels starting with the search rank first, then labels holding a word
 * that starts with its first word.
 *
 * @param label - Label of the entry, folded with foldText
 * @param section - Name of its section, folded with foldText
 * @param query - Search folded with foldText, trimmed and not empty
 * @returns 0 when the entry does not match, otherwise a rank up to 1 where higher sorts first
 */
function scoreItem(label: string, section: string, query: string): number {
    const words = query.split(/\s+/);
    const haystack = `${label} ${section}`;
    if (!words.every((word) => haystack.includes(word))) return 0;
    if (label.startsWith(query)) return 1;
    if (label.split(/[\s'-]+/).some((word) => word.startsWith(words[0]))) return 0.8;
    if (label.includes(words[0])) return 0.6;
    return 0.3;
}

/**
 * Keeps the entries matching the search, best first: sections are ordered by their best entry
 * and entries by score, ties keeping the default order. cmdk cannot reorder its groups, so with
 * its own filtering the best match could sit below weaker ones from earlier sections and Enter,
 * which runs the first entry, would pick the wrong one.
 *
 * @param sections - Sections in default order
 * @param search - Text typed in the search field, accents and case ignored
 * @param sectionName - Translated name of a section, also searched
 * @returns The matching sections, or every section unchanged when the search is blank
 */
function rankSections(
    sections: PaletteSection[],
    search: string,
    sectionName: (id: SectionId) => string,
): PaletteSection[] {
    const query = foldText(search).trim();
    if (!query) return sections;
    return sections
        .map((section) => {
            const name = foldText(sectionName(section.id));
            const scored = section.items
                .map((item) => ({ item, score: scoreItem(foldText(item.label), name, query) }))
                .filter((entry) => entry.score > 0)
                .sort((a, b) => b.score - a.score);
            return {
                section: { id: section.id, items: scored.map((entry) => entry.item) },
                best: scored[0]?.score ?? 0,
            };
        })
        .filter((entry) => entry.best > 0)
        .sort((a, b) => b.best - a.best)
        .map((entry) => entry.section);
}

/**
 * Builds the sections of the palette from the registry and the document: enabled commands by
 * group, tools (with the tool commands), then one entry per page. Each item gets a unique cmdk
 * value prefixed by its kind ("command:undo", "page:<id>").
 *
 * @param locale - Locale used to resolve registry labels
 * @param tool - Id of the active tool, marked as active
 * @param pages - Pages of the document, in tab order
 * @param activePageId - Page currently displayed, marked as active
 * @returns Non-empty sections in display order
 */
function buildSections(
    locale: Locale,
    tool: string,
    pages: { id: string; name: string }[],
    activePageId: string,
): PaletteSection[] {
    const items = new Map<SectionId, PaletteItem[]>(SECTION_ORDER.map((id) => [id, []]));

    for (const definition of getTools()) {
        items.get("tools")?.push({
            value: `tool:${definition.id}`,
            label: localize(definition.label, locale),
            icon: definition.icon,
            shortcut: definition.shortcuts?.[0],
            active: definition.id === tool,
            run: () => activateTool(definition.id),
        });
    }

    for (const command of getCommands()) {
        if (HIDDEN_COMMANDS.has(command.id)) continue;
        if (command.enabled && !command.enabled(editorApi)) continue;
        items.get(command.group === "tool" ? "tools" : command.group)?.push({
            value: `command:${command.id}`,
            label: localize(command.label, locale),
            icon: command.icon ?? ChevronRight,
            shortcut: command.shortcuts?.[0],
            run: () => runCommand(command.id),
        });
    }

    for (const page of pages) {
        items.get("pages")?.push({
            value: `page:${page.id}`,
            label: page.name,
            icon: FileText,
            active: page.id === activePageId,
            run: () => setActivePage(page.id),
        });
    }

    return SECTION_ORDER.map((id) => ({ id, items: items.get(id) ?? [] })).filter(
        (section) => section.items.length > 0,
    );
}

/**
 * Searchable content of the palette, mounted only while it is open so the search starts empty
 * and enabled commands reflect the selection at opening time. Results are ranked here rather than
 * by cmdk (see rankSections). Choosing an entry closes the palette first, then runs it, so
 * dialogs opened by commands replace the palette.
 *
 * @returns The search field and the list of entries
 */
function PaletteContent() {
    const t = useTranslations("palette");
    const locale = useStore(localeStore, (state) => state.locale);
    const tool = useStore(editorStore, (state) => state.tool);
    const pages = useStore(documentStore, (state) => state.document.pages);
    const activePageId = useStore(documentStore, (state) => state.document.activePageId);
    const [search, setSearch] = useState("");

    const sections = useMemo(
        () => buildSections(locale, tool, pages, activePageId),
        [locale, tool, pages, activePageId],
    );
    const visible = useMemo(
        () => rankSections(sections, search, (id) => t(`groups.${id}`)),
        [sections, search, t],
    );

    return (
        <Command shouldFilter={false} loop className="rounded-none bg-transparent">
            <div className="overlay-field mx-2.5 mt-2.5 flex h-11 items-center gap-2.5 px-3 text-muted-foreground">
                <Search aria-hidden="true" className="size-4 shrink-0" />
                <CommandPrimitive.Input
                    value={search}
                    onValueChange={setSearch}
                    placeholder={t("placeholder")}
                    aria-label={t("placeholder")}
                    className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                />
            </div>
            <CommandList className="max-h-[min(360px,55dvh)] scroll-py-1.5 p-1.5">
                <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
                    {t("empty")}
                </CommandEmpty>
                {visible.map((section) => (
                    <CommandGroup
                        key={section.id}
                        heading={t(`groups.${section.id}`)}
                        className="p-0 [&_[cmdk-group-heading]]:overlay-label"
                    >
                        {section.items.map((item) => (
                            <CommandItem
                                key={item.value}
                                value={item.value}
                                onSelect={() => {
                                    openDialog(null);
                                    item.run();
                                }}
                                className="h-9.5 text-[13.5px]"
                            >
                                <item.icon className="size-4" />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {item.active && (
                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <span
                                            aria-hidden="true"
                                            className="size-1.5 rounded-full bg-mark"
                                        />
                                        {t("active")}
                                    </span>
                                )}
                                {item.shortcut && <ShortcutKeys shortcut={item.shortcut} />}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                ))}
            </CommandList>
        </Command>
    );
}

/**
 * Command palette opened with Ctrl+K (Cmd+K on macOS): every enabled command, tool and page,
 * searchable without accents, with the shortcut of each entry. Closing it gives the focus back
 * to where it was, unless a command opened another dialog in its place.
 *
 * @returns The palette dialog, rendered by Radix only while it is open
 */
export function CommandPalette() {
    const t = useTranslations("palette");
    const open = useStore(editorStore, (state) => state.dialog === "palette");
    const returnFocus = useRef<HTMLElement | SVGElement | null>(null);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && openDialog(null)}>
            <DialogContent
                showCloseButton={false}
                onOpenAutoFocus={() => rememberFocus(returnFocus)}
                onCloseAutoFocus={(event) => restoreFocus(event, returnFocus)}
                className="top-[max(4rem,12dvh)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px]"
            >
                <div className="flex items-center justify-between gap-3 pt-3.5 pr-3.5 pl-4.5">
                    <DialogTitle>{t("title")}</DialogTitle>
                    <ShortcutKeys shortcut="escape" />
                </div>
                <DialogDescription className="sr-only">{t("description")}</DialogDescription>
                <PaletteContent />
            </DialogContent>
        </Dialog>
    );
}
