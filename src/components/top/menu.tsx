"use client";

import {
    CodeXml,
    Download,
    ExternalLink,
    FilePlus,
    FolderOpen,
    Grid3x3,
    Keyboard,
    Languages,
    Library,
    Menu,
    MonitorDown,
    Palette,
    Save,
    SaveAll,
    Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ComponentProps, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { commandShortcut, Hint, Keys } from "@/components/top/actions";
import { Appearance } from "@/components/top/appearance";
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
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuPortal,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useStore } from "@/hooks/useStore";
import { runCommand } from "@/lib/editor/commands";
import { saveFileAs } from "@/lib/storage/files";
import { deleteElements, documentStore, getElements } from "@/lib/stores/document";
import { editorStore, updateSettings } from "@/lib/stores/editor";
import { localeStore, setLocale } from "@/lib/stores/locale";
import { type GridType, type Locale, LOCALES } from "@/types/settings";

const GRID_SIZES = [10, 20, 40] as const;

const SOURCE_URL = "https://github.com/20syldev/wispen";

const MENU_PANEL_CLASS = "p-1.5";

const SUBMENU_PANEL_CLASS = `${MENU_PANEL_CLASS} max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto`;

const NARROW_QUERY = "(max-width: 539px)";

const STACKED_SUBMENU = { sideOffset: -224, alignOffset: 34 } as const;

const SIDE_SUBMENU = { sideOffset: 4, alignOffset: -7 } as const;

/**
 * Subscribes to the narrow-viewport media query.
 *
 * @param onChange - Called each time the query starts or stops matching
 * @returns Function removing the listener
 */
function subscribeNarrow(onChange: () => void): () => void {
    const query = window.matchMedia(NARROW_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

/**
 * Tells whether the viewport is too narrow to open submenus beside the main menu.
 *
 * @returns true below 540px
 */
function isNarrow(): boolean {
    return window.matchMedia(NARROW_QUERY).matches;
}

/**
 * Server snapshot of the narrow-viewport query: wide, the layout of the prerendered page.
 *
 * @returns Always false
 */
function isNarrowOnServer(): boolean {
    return false;
}

/**
 * Deletes every element of the active page, locked ones included, as a single undo step, then
 * offers to undo it from a toast as long as nothing else changed in the meantime.
 *
 * @param message - Toast text, already translated
 * @param undoLabel - Label of the toast action, already translated
 */
function clearPage(message: string, undoLabel: string): void {
    const ids = getElements().map((el) => el.id);
    if (ids.length === 0) return;
    deleteElements(ids);
    const step = documentStore.getState().past.at(-1);
    toast(message, {
        action: {
            label: undoLabel,
            onClick: () => {
                if (documentStore.getState().past.at(-1) === step) runCommand("undo");
            },
        },
    });
}

/**
 * Menu entry bound to a command: runs it through runCommand and shows its shortcut on the right.
 *
 * @param command - Command id from the registry
 * @param children - Icon and label of the entry
 * @param props - Other props of the menu item, such as disabled
 * @returns The menu item with its shortcut chip
 */
function CommandItem({
    command,
    children,
    ...props
}: { command: string } & ComponentProps<typeof DropdownMenuItem>) {
    return (
        <DropdownMenuItem onSelect={() => runCommand(command)} {...props}>
            {children}
            <Keys shortcut={commandShortcut(command)} className="ml-auto" />
        </DropdownMenuItem>
    );
}

/**
 * Main menu behind the hamburger button of the top-left island: file operations, grid, theme
 * and language preferences, help, PWA installation, clearing the page (confirmed by an alert
 * dialog) and the link to the source code. Below 540px, where a submenu has no room beside the
 * 256px main menu opened from the left edge, submenus are stacked over the main menu just below
 * their trigger row. The alert dialog opens once the menu is gone, so on close it hands the focus
 * back to the hamburger button rather than to the document body.
 *
 * @returns The menu trigger, its content and the confirmation dialog
 */
export function MainMenu() {
    const t = useTranslations("menu");
    const tc = useTranslations("common");
    const locale = useStore(localeStore, (state) => state.locale);
    const settings = useStore(editorStore, (state) => state.settings);
    const { count, pageName } = useStore(documentStore, ({ document }) => {
        const page = document.pages.find((p) => p.id === document.activePageId);
        return {
            count: (page ?? document.pages[0]).elements.length,
            pageName: (page ?? document.pages[0]).name,
        };
    });
    const { canInstall, install } = useInstallPrompt();
    const [confirming, setConfirming] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, isNarrowOnServer);
    const submenu = narrow ? STACKED_SUBMENU : SIDE_SUBMENU;
    const keepOpen = (event: Event) => event.preventDefault();

    return (
        <>
            <DropdownMenu>
                <Hint label={t("menu")}>
                    <DropdownMenuTrigger asChild>
                        <button
                            ref={triggerRef}
                            type="button"
                            aria-label={t("menu")}
                            className="grid size-9 shrink-0 place-items-center rounded-md text-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                            <Menu className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                    </DropdownMenuTrigger>
                </Hint>
                <DropdownMenuContent
                    align="start"
                    sideOffset={10}
                    collisionPadding={12}
                    className={`w-72 ${MENU_PANEL_CLASS}`}
                >
                    <DropdownMenuGroup>
                        <CommandItem command="new-document">
                            <FilePlus strokeWidth={1.75} />
                            {t("newDocument")}
                        </CommandItem>
                        <CommandItem command="open-file">
                            <FolderOpen strokeWidth={1.75} />
                            {t("openFile")}
                        </CommandItem>
                        <CommandItem command="save-file">
                            <Save strokeWidth={1.75} />
                            {t("save")}
                        </CommandItem>
                        <DropdownMenuItem onSelect={() => void saveFileAs()}>
                            <SaveAll strokeWidth={1.75} />
                            {t("saveAs")}
                        </DropdownMenuItem>
                        <CommandItem command="documents">
                            <Library strokeWidth={1.75} />
                            {t("documents")}
                        </CommandItem>
                        <CommandItem command="export">
                            <Download strokeWidth={1.75} />
                            {t("export")}
                        </CommandItem>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator />

                    <DropdownMenuGroup>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Grid3x3 strokeWidth={1.75} />
                                {t("grid")}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent
                                    {...submenu}
                                    collisionPadding={12}
                                    className={`w-56 ${SUBMENU_PANEL_CLASS}`}
                                >
                                    <DropdownMenuCheckboxItem
                                        checked={settings.showGrid}
                                        onSelect={keepOpen}
                                        onCheckedChange={() => runCommand("toggle-grid")}
                                    >
                                        {t("showGrid")}
                                        <Keys
                                            shortcut={commandShortcut("toggle-grid")}
                                            className="ml-auto"
                                        />
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem
                                        checked={settings.snapToGrid}
                                        onSelect={keepOpen}
                                        onCheckedChange={() => runCommand("toggle-snap")}
                                    >
                                        {t("snap")}
                                        <Keys
                                            shortcut={commandShortcut("toggle-snap")}
                                            className="ml-auto"
                                        />
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>{t("gridStyle")}</DropdownMenuLabel>
                                    <DropdownMenuRadioGroup
                                        value={settings.gridType}
                                        onValueChange={(value) =>
                                            updateSettings({ gridType: value as GridType })
                                        }
                                    >
                                        <DropdownMenuRadioItem value="dots" onSelect={keepOpen}>
                                            {t("gridDots")}
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="lines" onSelect={keepOpen}>
                                            {t("gridLines")}
                                        </DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>{t("gridSize")}</DropdownMenuLabel>
                                    <DropdownMenuRadioGroup
                                        value={String(settings.gridSize)}
                                        onValueChange={(value) =>
                                            updateSettings({ gridSize: Number(value) })
                                        }
                                    >
                                        {GRID_SIZES.map((size) => (
                                            <DropdownMenuRadioItem
                                                key={size}
                                                value={String(size)}
                                                onSelect={keepOpen}
                                                className="font-num tabular-nums"
                                            >
                                                {t("gridSizeValue", { size })}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Palette strokeWidth={1.75} />
                                {t("appearance")}
                            </DropdownMenuSubTrigger>
                            <Appearance
                                {...submenu}
                                collisionPadding={12}
                                className={SUBMENU_PANEL_CLASS}
                            />
                        </DropdownMenuSub>

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Languages strokeWidth={1.75} />
                                {t("language")}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent
                                    {...submenu}
                                    collisionPadding={12}
                                    className={`w-48 ${SUBMENU_PANEL_CLASS}`}
                                >
                                    <DropdownMenuRadioGroup
                                        value={locale}
                                        onValueChange={(value) => setLocale(value as Locale)}
                                    >
                                        {LOCALES.map((entry) => (
                                            <DropdownMenuRadioItem
                                                key={entry.id}
                                                value={entry.id}
                                                lang={entry.id}
                                            >
                                                {entry.label}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator />

                    <DropdownMenuGroup>
                        <CommandItem command="shortcuts">
                            <Keyboard strokeWidth={1.75} />
                            {t("shortcuts")}
                        </CommandItem>
                        {canInstall && (
                            <DropdownMenuItem onSelect={() => void install()}>
                                <MonitorDown strokeWidth={1.75} />
                                {t("install")}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            variant="destructive"
                            disabled={count === 0}
                            onSelect={() => setConfirming(true)}
                        >
                            <Trash2 strokeWidth={1.75} />
                            {t("clearPage")}
                        </DropdownMenuItem>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem asChild>
                        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
                            <CodeXml strokeWidth={1.75} />
                            {t("source")}
                            <ExternalLink className="ml-auto size-3.5" strokeWidth={1.75} />
                        </a>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent
                    className="rounded-island border-border/80 bg-popover shadow-lg"
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        triggerRef.current?.focus();
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-brand">
                            {t("clearTitle", { name: pageName })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("clearDescription", { count })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-md">{tc("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            className="rounded-md"
                            onClick={() => clearPage(t("cleared"), t("undo"))}
                        >
                            {t("clearConfirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
