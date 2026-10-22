"use client";

import { ArrowLeft, ArrowRight, Copy, PenLine, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    type KeyboardEvent,
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import { GuardedMenuContent } from "@/components/canvas/menu";
import { ShortcutKeys } from "@/components/dialogs/shortcuts";
import { Island } from "@/components/island";
import { Keys } from "@/components/top/actions";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { addPage, duplicatePage } from "@/lib/editor/actions";
import {
    deletePage,
    documentStore,
    movePage,
    renamePage,
    setActivePage,
} from "@/lib/stores/document";
import { cn } from "@/lib/utils";

interface PendingDelete {
    id: string;
    name: string;
    count: number;
}

const TAB_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * Moves the focus between the tabs of a tab list with the arrow keys, Home and End, wrapping
 * around, and displays the page of the tab reached (automatic activation).
 *
 * @param event - Keydown event of a tab button whose parent is the tab list
 * @returns true when the key was handled
 */
function moveTabFocus(event: KeyboardEvent<HTMLButtonElement>): boolean {
    if (!TAB_KEYS.has(event.key)) return false;
    const tabs = Array.from(
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ??
            [],
    );
    const index = tabs.indexOf(event.currentTarget);
    if (index < 0 || tabs.length === 0) return false;

    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;

    const target = tabs[next];
    target.focus();
    if (target.dataset.pageId) setActivePage(target.dataset.pageId);
    return true;
}

/**
 * Scrolls a horizontally scrollable list just enough to show one of its children with a small
 * margin, without moving any other scroll container of the page.
 *
 * @param list - Scroll container, which must be the offset parent of the child
 * @param child - Element to reveal, positioned by its offsetLeft relative to the list
 */
function revealInList(list: HTMLElement, child: HTMLElement): void {
    const margin = 12;
    const start = child.offsetLeft - margin;
    const end = child.offsetLeft + child.offsetWidth + margin;
    if (start < list.scrollLeft) list.scrollTo({ left: start, behavior: "smooth" });
    else if (end > list.scrollLeft + list.clientWidth) {
        list.scrollTo({ left: end - list.clientWidth, behavior: "smooth" });
    }
}

/**
 * Moves the focus to the active tab of a tab list on the next frame, once React has rendered the
 * deletion that removed the focused tab, unless the focus already landed somewhere else.
 *
 * @param list - Tab list element, read on the next frame
 */
function focusActiveTab(list: HTMLElement | null): void {
    requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (focused && focused !== document.body) return;
        list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    });
}

/**
 * Inline field replacing a tab while its page is renamed, as wide as its text. Enter or leaving
 * the field saves the name, Escape gives up; a blank name keeps the previous one.
 *
 * @param id - Page being renamed
 * @param name - Current name, selected when the field opens
 * @param onDone - Called once when editing ends, with true when the focus should go back to the
 * tab (keyboard validation or cancellation)
 * @returns The text field
 */
function RenameField({
    id,
    name,
    onDone,
}: {
    id: string;
    name: string;
    onDone: (refocus: boolean) => void;
}) {
    const t = useTranslations("pages");
    const [draft, setDraft] = useState(name);
    const finished = useRef(false);

    const finish = (commit: boolean, refocus: boolean) => {
        if (finished.current) return;
        finished.current = true;
        if (commit && draft.trim() && draft.trim() !== name) renamePage(id, draft);
        onDone(refocus);
    };

    return (
        <Input
            autoFocus
            value={draft}
            maxLength={60}
            aria-label={t("nameLabel")}
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => finish(true, false)}
            onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    finish(true, true);
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    finish(false, true);
                }
            }}
            style={{ width: `calc(${Math.max(draft.length, 4) + 1}ch + 1.5rem)` }}
            className="h-8 max-w-56 min-w-20 shrink-0 rounded-md border-ring bg-card px-2.5 text-[13px] font-semibold shadow-none focus-visible:ring-ring/25 md:text-[13px] dark:bg-card"
        />
    );
}

/**
 * One page tab: click displays the page, double-click or F2 renames it in place, the arrow keys
 * move between tabs, and a context menu (right-click or long press) offers rename, duplicate,
 * move and delete. The active tab sits on the sliding marker pill of its tab bar. Memoized so
 * drawing on the page, which replaces the page object on every change, does not render the tabs
 * again.
 *
 * @param id - Id of the page, also set on the button for the arrow-key navigation
 * @param name - Page name shown on the tab
 * @param active - Whether the page is displayed
 * @param index - Position of the page in the document
 * @param count - Number of pages, to disable moves past the ends and deleting the last page
 * @param renaming - Whether the inline rename field replaces the tab
 * @param onRename - Starts renaming this page with its id, or ends renaming with null
 * @param onDelete - Asks to delete the page, confirmed by the caller when it holds elements
 * @returns The tab with its tooltip and context menu, or the rename field
 */
const PageTab = memo(function PageTab({
    id,
    name,
    active,
    index,
    count,
    renaming,
    onRename,
    onDelete,
}: {
    id: string;
    name: string;
    active: boolean;
    index: number;
    count: number;
    renaming: boolean;
    onRename: (id: string | null) => void;
    onDelete: (id: string) => void;
}) {
    const t = useTranslations("pages");
    const buttonRef = useRef<HTMLButtonElement>(null);
    const refocus = useRef(false);
    const afterClose = useRef<"rename" | "delete" | null>(null);

    useEffect(() => {
        if (renaming || !refocus.current) return;
        refocus.current = false;
        buttonRef.current?.focus();
    }, [renaming]);

    if (renaming) {
        return (
            <RenameField
                id={id}
                name={name}
                onDone={(focusTab) => {
                    refocus.current = focusTab;
                    onRename(null);
                }}
            />
        );
    }

    return (
        <ContextMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <ContextMenuTrigger asChild>
                        <button
                            ref={buttonRef}
                            type="button"
                            role="tab"
                            data-page-id={id}
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            onClick={() => setActivePage(id)}
                            onDoubleClick={() => onRename(id)}
                            onKeyDown={(event) => {
                                if (event.key === "F2") {
                                    event.preventDefault();
                                    onRename(id);
                                } else if (moveTabFocus(event)) {
                                    event.preventDefault();
                                }
                            }}
                            className={cn(
                                "h-8 max-w-48 shrink-0 rounded-dock-item px-3.25 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none",
                                "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
                                "data-[state=open]:bg-(--ov-hover) data-[state=open]:text-foreground",
                                active && "cursor-text font-semibold text-foreground",
                            )}
                        >
                            <span className="relative grid grid-cols-[minmax(0,1fr)]">
                                <span
                                    aria-hidden="true"
                                    className="invisible col-start-1 row-start-1 truncate font-semibold"
                                >
                                    {name}
                                </span>
                                <span className="col-start-1 row-start-1 truncate">{name}</span>
                            </span>
                        </button>
                    </ContextMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={10} className="text-center">
                    {t("hint")}
                    <br />
                    <span className="opacity-70">{t("menuHint")}</span>
                </TooltipContent>
            </Tooltip>
            <GuardedMenuContent
                className="min-w-52 shadow-lg"
                onCloseAutoFocus={(event) => {
                    const action = afterClose.current;
                    afterClose.current = null;
                    if (action === "rename") {
                        event.preventDefault();
                        onRename(id);
                    } else if (action === "delete") {
                        event.preventDefault();
                        onDelete(id);
                    }
                }}
            >
                <ContextMenuItem
                    onSelect={() => {
                        afterClose.current = "rename";
                    }}
                >
                    <PenLine />
                    {t("rename")}
                    <Keys shortcut="f2" className="ml-auto" />
                </ContextMenuItem>
                <ContextMenuItem
                    onSelect={() => {
                        setActivePage(id);
                        duplicatePage(id);
                    }}
                >
                    <Copy />
                    {t("duplicate")}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={index === 0} onSelect={() => movePage(id, index - 1)}>
                    <ArrowLeft />
                    {t("moveLeft")}
                </ContextMenuItem>
                <ContextMenuItem
                    disabled={index === count - 1}
                    onSelect={() => movePage(id, index + 1)}
                >
                    <ArrowRight />
                    {t("moveRight")}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    variant="destructive"
                    disabled={count <= 1}
                    onSelect={() => {
                        afterClose.current = "delete";
                    }}
                >
                    <Trash2 />
                    {t("delete")}
                </ContextMenuItem>
            </GuardedMenuContent>
        </ContextMenu>
    );
});

/**
 * Page tabs of the bottom bar: a pill island with one tab per page, a marker pill gliding behind
 * the active one, and a button adding a page. Tabs scroll horizontally inside the island when they do
 * not fit (mouse wheel included), fading out on the sides that hide tabs, and the active tab is
 * kept in view. Deleting a page that holds elements asks for confirmation, after which the focus
 * goes back to that tab, or to the active one when the page is gone. Only page ids and names are
 * read from the store, so drawing on a page does not render the tab bar again.
 *
 * @returns The tab bar island with its delete confirmation dialog
 */
export function PageTabs() {
    const t = useTranslations("pages");
    const ids = useStore(documentStore, (state) => state.document.pages.map((page) => page.id));
    const names = useStore(documentStore, (state) => state.document.pages.map((page) => page.name));
    const activeId = useStore(documentStore, (state) => state.document.activePageId);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingDelete | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [edges, setEdges] = useState({ start: false, end: false });
    const listRef = useRef<HTMLDivElement>(null);
    const layoutKey = names.join("\n");

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const update = () => {
            const start = list.scrollLeft > 1;
            const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
            setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
        };
        const reveal = () => {
            const focused = document.activeElement;
            const target =
                focused instanceof HTMLElement && list.contains(focused)
                    ? focused
                    : list.querySelector<HTMLElement>('[aria-selected="true"]');
            if (target) revealInList(list, target);
            update();
        };
        update();
        const observer = new ResizeObserver(reveal);
        observer.observe(list);
        list.addEventListener("scroll", update, { passive: true });
        return () => {
            observer.disconnect();
            list.removeEventListener("scroll", update);
        };
    }, [layoutKey, renamingId]);

    useLayoutEffect(() => {
        const list = listRef.current;
        const tab = list?.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(activeId)}"]`);
        if (list && tab) revealInList(list, tab);
    }, [activeId, ids.length]);

    const requestDelete = useCallback((pageId: string) => {
        const page = documentStore.getState().document.pages.find((p) => p.id === pageId);
        if (!page) return;
        if (page.elements.length === 0) {
            deletePage(pageId);
            focusActiveTab(listRef.current);
            return;
        }
        setPending({ id: page.id, name: page.name, count: page.elements.length });
        setConfirming(true);
    }, []);

    return (
        <Island className="flex max-w-full min-w-0 items-center gap-0.5 rounded-dock p-0.75">
            <div
                ref={listRef}
                role="tablist"
                aria-label={t("label")}
                aria-orientation="horizontal"
                onWheel={(event) => {
                    if (event.deltaY !== 0) event.currentTarget.scrollLeft += event.deltaY;
                }}
                className={cn(
                    "glide flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                    edges.start && "mask-l-from-[calc(100%-1.5rem)]",
                    edges.end && "mask-r-from-[calc(100%-1.5rem)]",
                )}
            >
                {ids.map((id, index) => (
                    <PageTab
                        key={id}
                        id={id}
                        name={names[index] ?? ""}
                        active={id === activeId}
                        index={index}
                        count={ids.length}
                        renaming={id === renamingId}
                        onRename={setRenamingId}
                        onDelete={requestDelete}
                    />
                ))}
            </div>

            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("add")}
                        onClick={() => addPage()}
                        className="shrink-0 rounded-dock-item"
                    >
                        <Plus />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={10} className="flex items-center gap-2">
                    {t("add")}
                    <ShortcutKeys shortcut="alt+n" />
                </TooltipContent>
            </Tooltip>

            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent
                    className="rounded-island border-border/80 bg-popover shadow-lg"
                    onCloseAutoFocus={(event) => {
                        const list = listRef.current;
                        const tab =
                            list?.querySelector<HTMLElement>(
                                `[data-page-id="${CSS.escape(pending?.id ?? "")}"]`,
                            ) ?? list?.querySelector<HTMLElement>('[aria-selected="true"]');
                        if (!tab) return;
                        event.preventDefault();
                        tab.focus();
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-brand">
                            {t("deleteTitle", { name: pending?.name ?? "" })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("deleteDescription", { count: pending?.count ?? 0 })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => pending && deletePage(pending.id)}
                        >
                            {t("deleteConfirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Island>
    );
}
