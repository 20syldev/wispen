"use client";

import {
    Copy,
    Download,
    Ellipsis,
    FolderOpen,
    Inbox,
    LoaderCircle,
    Pencil,
    Plus,
    Presentation,
    Search,
    SearchX,
    Trash2,
    X,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Tip } from "@/components/panel/tip";
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
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStore } from "@/hooks/useStore";
import { rememberFocus, restoreFocus } from "@/lib/editor/focus";
import { downloadDocument, newDocument, openFile } from "@/lib/storage/files";
import {
    deleteStoredDocument,
    describeDocument,
    type DocumentEntry,
    duplicateStoredDocument,
    flushAutosave,
    listDocuments,
    openStoredDocument,
    readStoredDocument,
    renameStoredDocument,
} from "@/lib/storage/persistence";
import { documentStore } from "@/lib/stores/document";
import { editorStore, openDialog } from "@/lib/stores/editor";
import { cn } from "@/lib/utils";

type RowAction = "open" | "rename" | "duplicate" | "download" | "delete";

/**
 * Folds a text for searching: lower case, without accents.
 *
 * @param text - Document name or search query
 * @returns The text without diacritics, in lower case and trimmed
 */
function searchable(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
}

/**
 * Reads the stored documents once the pending autosave is written, so the displayed document
 * shows its latest name and counts. The displayed document is listed even when storage failed.
 *
 * @returns Entries, most recently updated first
 */
async function loadEntries(): Promise<DocumentEntry[]> {
    await flushAutosave();
    const list = await listDocuments();
    const live = documentStore.getState().document;
    return list.some((entry) => entry.id === live.id) ? list : [describeDocument(live), ...list];
}

/**
 * Keeps the dialog open when Escape is meant for the rename field, which cancels the renaming
 * itself. Radix listens to Escape on the document before the field sees it.
 *
 * @param event - Escape key event received by the dialog
 */
function keepRenameOnEscape(event: globalThis.KeyboardEvent): void {
    if (event.target instanceof HTMLElement && event.target.closest("[data-rename]")) {
        event.preventDefault();
    }
}

/**
 * Inline field replacing a document name while renaming. Enter or leaving the field commits,
 * Escape cancels; the field focuses itself once the actions menu has closed.
 *
 * @param name - Current name, selected when the field appears
 * @param label - Accessible name of the field
 * @param onDone - Receives the typed name, or null when the renaming is cancelled
 * @returns The focused text field
 */
function RenameField({
    name,
    label,
    onDone,
}: {
    name: string;
    label: string;
    onDone: (name: string | null) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const finished = useRef(false);
    const [value, setValue] = useState(name);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            ref.current?.focus();
            ref.current?.select();
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    const finish = (next: string | null) => {
        if (finished.current) return;
        finished.current = true;
        onDone(next);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finish(value);
        } else if (event.key === "Escape") {
            event.preventDefault();
            finish(null);
        }
    };

    return (
        <Input
            ref={ref}
            data-rename=""
            value={value}
            maxLength={200}
            aria-label={label}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => finish(value)}
            className="h-7 rounded-sm px-2 text-sm font-medium md:text-sm"
        />
    );
}

/**
 * One stored document: icon tile, name, last update and page count, plus its actions menu.
 * The displayed document gets the vermilion tile and an "Open" label in the text color, which
 * keeps its contrast on the hovered row.
 *
 * @param entry - Stored document to show; its name, update time and page count are displayed
 * @param current - The document is the one displayed in the editor
 * @param renaming - Shows the inline rename field instead of the name
 * @param now - Reference time of the relative dates, refreshed every minute; later updates read
 * as just now
 * @param onAction - Runs an action of the row
 * @param onRenamed - Receives the new name, or null when the renaming is cancelled
 * @returns The list item, with the rename field in place of the name while renaming
 */
function DocumentRow({
    entry,
    current,
    renaming,
    now,
    onAction,
    onRenamed,
}: {
    entry: DocumentEntry;
    current: boolean;
    renaming: boolean;
    now: Date;
    onAction: (action: RowAction, entry: DocumentEntry) => void;
    onRenamed: (name: string | null) => void;
}) {
    const t = useTranslations("documents");
    const format = useFormatter();
    const keepFocus = useRef(false);
    const updated = new Date(entry.updatedAt);
    const elapsed = new Date(Math.min(entry.updatedAt, now.getTime()));

    const tile = (
        <span
            aria-hidden="true"
            className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md transition-colors",
                current
                    ? "bg-mark text-mark-foreground"
                    : "bg-secondary text-muted-foreground group-hover/row:bg-card",
            )}
        >
            <Presentation className="size-4" />
        </span>
    );

    const details = (
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {current && (
                <span className="shrink-0 font-medium text-foreground">{t("current")}</span>
            )}
            {current && (
                <span aria-hidden="true" className="size-0.5 shrink-0 rounded-full bg-current" />
            )}
            <Tip label={format.dateTime(updated, { dateStyle: "long", timeStyle: "short" })}>
                <time dateTime={updated.toISOString()}>
                    {t("updated", { time: format.relativeTime(elapsed, now) })}
                </time>
            </Tip>
            <span aria-hidden="true" className="size-0.5 shrink-0 rounded-full bg-current" />
            <span className="shrink-0 font-num tabular-nums">
                {t("pageCount", { count: entry.pageCount })}
            </span>
        </span>
    );

    return (
        <li
            data-row=""
            className="overlay-item group/row min-h-0 gap-1 [--overlay-pad-end:0.375rem] [--overlay-pad:0px]"
        >
            {renaming ? (
                <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-2">
                    {tile}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <RenameField
                            name={entry.name}
                            label={t("renameLabel", { name: entry.name })}
                            onDone={onRenamed}
                        />
                        {details}
                    </span>
                </div>
            ) : (
                <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    onClick={() => onAction("open", entry)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pl-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                    {tile}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-sm leading-tight font-medium">
                            {entry.name}
                        </span>
                        {details}
                    </span>
                </button>
            )}

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("actions", { name: entry.name })}
                        className="shrink-0 text-muted-foreground hover:bg-card data-[state=open]:bg-card data-[state=open]:opacity-100 pointer-fine:opacity-0 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-hover/row:opacity-100"
                    >
                        <Ellipsis />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="min-w-52"
                    onCloseAutoFocus={(event) => {
                        if (!keepFocus.current) return;
                        keepFocus.current = false;
                        event.preventDefault();
                    }}
                >
                    <DropdownMenuItem
                        onSelect={() => {
                            keepFocus.current = true;
                            onAction("rename", entry);
                        }}
                    >
                        <Pencil />
                        {t("rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onAction("duplicate", entry)}>
                        <Copy />
                        {t("duplicate")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onAction("download", entry)}>
                        <Download />
                        {t("download")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => onAction("delete", entry)}
                    >
                        <Trash2 />
                        {t("delete")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    );
}

/**
 * Placeholder of the list: nothing stored yet, or nothing matching the search.
 *
 * @param query - Current search text; empty when the list itself is empty
 * @returns The centered message, with a hint about autosaving when nothing is stored
 */
function EmptyState({ query }: { query: string }) {
    const t = useTranslations("documents");
    const Icon = query ? SearchX : Inbox;

    return (
        <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center text-muted-foreground">
            <span className="mb-1.5 grid size-12 place-items-center rounded-island border border-dashed border-input bg-card">
                <Icon aria-hidden="true" className="size-5" />
            </span>
            {query ? (
                <p className="max-w-[36ch] text-sm">{t("noResults", { query })}</p>
            ) : (
                <>
                    <p className="font-brand text-base text-foreground">{t("empty")}</p>
                    <p className="max-w-[36ch] text-sm">{t("emptyHint")}</p>
                </>
            )}
        </div>
    );
}

/**
 * Body of the documents dialog, mounted each time the dialog opens so the list is read fresh:
 * search, header actions, the list and the delete confirmation.
 *
 * @returns The dialog header, the scrollable list and the delete confirmation
 */
function DocumentsBrowser() {
    const t = useTranslations("documents");
    const tc = useTranslations("common");
    const now = useNow({ updateInterval: 60_000 });
    const currentId = useStore(documentStore, (state) => state.document.id);
    const [entries, setEntries] = useState<DocumentEntry[] | null>(null);
    const [query, setQuery] = useState("");
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<DocumentEntry | null>(null);
    const [confirming, setConfirming] = useState(false);

    const refresh = async () => setEntries(await loadEntries());

    useEffect(() => {
        let active = true;
        void loadEntries().then((list) => {
            if (active) setEntries(list);
        });
        return () => {
            active = false;
        };
    }, []);

    const visible = useMemo(() => {
        const needle = searchable(query);
        return (entries ?? []).filter((entry) => searchable(entry.name).includes(needle));
    }, [entries, query]);

    const run = async (action: RowAction, entry: DocumentEntry) => {
        if (action === "open") {
            if (await openStoredDocument(entry.id)) openDialog(null);
        } else if (action === "rename") {
            setRenamingId(entry.id);
        } else if (action === "duplicate") {
            const copy = await duplicateStoredDocument(entry.id);
            if (copy) toast.success(t("duplicated", { name: copy.name }));
            else toast.error(t("duplicateError"));
            await refresh();
        } else if (action === "download") {
            const live = documentStore.getState().document;
            const doc = live.id === entry.id ? live : await readStoredDocument(entry.id);
            if (doc) downloadDocument(doc);
            else toast.error(t("openError"));
        } else {
            setDeleting(entry);
            setConfirming(true);
        }
    };

    const rename = async (entry: DocumentEntry, name: string | null) => {
        setRenamingId(null);
        const trimmed = name?.trim();
        if (!trimmed || trimmed === entry.name) return;
        setEntries(
            (list) => list?.map((e) => (e.id === entry.id ? { ...e, name: trimmed } : e)) ?? null,
        );
        await renameStoredDocument(entry.id, trimmed);
        await refresh();
    };

    const remove = async () => {
        setConfirming(false);
        if (!deleting) return;
        if (await deleteStoredDocument(deleting.id)) {
            toast.success(t("deleted", { name: deleting.name }));
        }
        await refresh();
    };

    const create = async () => {
        await newDocument();
        openDialog(null);
    };

    const openFromDisk = () => {
        openDialog(null);
        void openFile();
    };

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" && visible.length > 0) {
            event.preventDefault();
            void run("open", visible[0]);
        }
    };

    let content;
    if (entries === null) {
        content = (
            <div
                role="status"
                className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
            >
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                {t("loading")}
            </div>
        );
    } else if (visible.length === 0) {
        content = <EmptyState query={entries.length > 0 ? query.trim() : ""} />;
    } else {
        content = (
            <ul className="glide flex flex-col gap-0.5" aria-label={t("title")}>
                {visible.map((entry) => (
                    <DocumentRow
                        key={entry.id}
                        entry={entry}
                        current={entry.id === currentId}
                        renaming={entry.id === renamingId}
                        now={now}
                        onAction={(action, target) => void run(action, target)}
                        onRenamed={(name) => void rename(entry, name)}
                    />
                ))}
            </ul>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-4 px-5 pt-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                    <DialogHeader className="gap-1 text-left">
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

                <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="overlay-field relative min-w-0 flex-1">
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            type="search"
                            autoFocus
                            value={query}
                            placeholder={t("search")}
                            aria-label={t("search")}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={onSearchKeyDown}
                            className="border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0 dark:bg-transparent [&::-webkit-search-cancel-button]:appearance-none"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            onClick={openFromDisk}
                            className="grow basis-40 sm:grow-0 sm:basis-auto"
                        >
                            <FolderOpen />
                            {t("open")}
                        </Button>
                        <Button
                            onClick={() => void create()}
                            className="grow basis-40 sm:grow-0 sm:basis-auto"
                        >
                            <Plus />
                            {t("new")}
                        </Button>
                    </div>
                </div>
            </div>

            <ScrollArea className="max-h-[min(26rem,55dvh)] border-t border-(--ov-line) [&>[data-slot=scroll-area-viewport]]:max-h-[inherit]">
                <div className="p-2">{content}</div>
            </ScrollArea>

            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("deleteTitle", { name: deleting?.name ?? "" })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => void remove()}>
                            {tc("delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/**
 * Local documents dialog, opened from the main menu, the command palette or Ctrl+Shift+O:
 * lists the documents saved in this browser, most recent first, to open, rename, duplicate,
 * download or delete them, and starts a new document or opens a file from the disk.
 *
 * @returns The dialog, whose body is mounted only while it is open
 */
export function DocumentsDialog() {
    const open = useStore(editorStore, (state) => state.dialog === "documents");
    const returnFocus = useRef<HTMLElement | SVGElement | null>(null);

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) openDialog(null);
            }}
        >
            <DialogContent
                showCloseButton={false}
                onEscapeKeyDown={keepRenameOnEscape}
                onOpenAutoFocus={() => rememberFocus(returnFocus)}
                onCloseAutoFocus={(event) => restoreFocus(event, returnFocus)}
                className="gap-0 overflow-hidden p-0 sm:max-w-[40rem]"
            >
                <DocumentsBrowser />
            </DialogContent>
        </Dialog>
    );
}
