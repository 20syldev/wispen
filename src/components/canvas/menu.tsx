"use client";

import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignHorizontalSpaceAround,
    AlignStartHorizontal,
    AlignStartVertical,
    AlignVerticalSpaceAround,
    ArrowDownToLine,
    ArrowUpToLine,
    BringToFront,
    ClipboardPaste,
    Copy,
    CopyPlus,
    Group,
    Layers,
    Lock,
    LockOpen,
    Maximize,
    Paintbrush,
    PaintRoller,
    Scissors,
    SendToBack,
    SquareDashedMousePointer,
    Trash2,
    Ungroup,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ComponentProps, type ComponentType, type ReactNode, useRef } from "react";
import { toast } from "sonner";

import { Keys } from "@/components/top/actions";
import {
    ContextMenu,
    ContextMenuCheckboxItem,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useActivePage, useSelectedElements } from "@/hooks/useScene";
import { useStore } from "@/hooks/useStore";
import { getContextPoint } from "@/lib/canvas/interaction";
import { editorApi } from "@/lib/editor/api";
import { copySelection, cutSelection, pasteFromClipboard } from "@/lib/editor/clipboard";
import { getCommands, runCommand } from "@/lib/editor/commands";
import { editorStore } from "@/lib/stores/editor";

/**
 * Finds the first keyboard shortcut of a registered command, shown next to its menu entry.
 *
 * @param id - Id of a core or plugin command, such as "duplicate"
 * @returns The shortcut definition, or undefined when the command has none
 */
function commandShortcut(id: string): string | undefined {
    return getCommands().find((command) => command.id === id)?.shortcuts?.[0];
}

/**
 * Context menu content that ignores the release of the button that opened it. Radix chooses the
 * entry under the pointer on pointerup, and when the menu opens under the pointer (shifted to
 * fit near an edge, as for the page tabs), a quick right-click or a two-finger tap on a touchpad
 * releases over an entry, possibly a destructive one. Only a press that started inside the menu
 * can choose an entry with the pointer; the press ends on any release, even outside the menu, so
 * an aborted press does not unlock the next quick right-click. Keyboard choices are unaffected.
 *
 * @param onPointerDownCapture - Optional handler, still called
 * @param onPointerUpCapture - Optional handler, still called
 * @param props - Other props of ContextMenuContent
 * @returns The menu content
 */
export function GuardedMenuContent({
    onPointerDownCapture,
    onPointerUpCapture,
    ...props
}: ComponentProps<typeof ContextMenuContent>) {
    const pressed = useRef(false);

    return (
        <ContextMenuContent
            onPointerDownCapture={(event) => {
                pressed.current = true;
                const release = () => {
                    pressed.current = false;
                    window.removeEventListener("pointerup", release);
                    window.removeEventListener("pointercancel", release);
                };
                window.addEventListener("pointerup", release);
                window.addEventListener("pointercancel", release);
                onPointerDownCapture?.(event);
            }}
            onPointerUpCapture={(event) => {
                if (!pressed.current) event.preventDefault();
                onPointerUpCapture?.(event);
            }}
            {...props}
        />
    );
}

/**
 * Keys of a shortcut aligned on the right of a menu entry, as the same chip as the main menu.
 *
 * @param shortcut - Shortcut definition such as "mod+d"; nothing is rendered when undefined
 * @returns The shortcut aligned on the right, or null
 */
function MenuShortcut({ shortcut }: { shortcut?: string }) {
    if (!shortcut) return null;
    return <Keys shortcut={shortcut} className="ml-auto" />;
}

/**
 * Menu entry with an icon, a label and the keys of its shortcut aligned on the right.
 *
 * @param label - Text of the entry
 * @param icon - Lucide icon drawn before the label
 * @param shortcut - Shortcut definition such as "mod+d", omitted when the action has none
 * @param disabled - Greys the entry out and skips it in keyboard navigation
 * @param destructive - Paints the entry with the destructive color
 * @param onSelect - Action run when the entry is chosen, before the menu closes
 * @returns The menu item
 */
function Entry({
    label,
    icon: Icon,
    shortcut,
    disabled,
    destructive,
    onSelect,
}: {
    label: string;
    icon: ComponentType<{ className?: string }>;
    shortcut?: string;
    disabled?: boolean;
    destructive?: boolean;
    onSelect: () => void;
}) {
    return (
        <ContextMenuItem
            variant={destructive ? "destructive" : "default"}
            disabled={disabled}
            onSelect={onSelect}
        >
            <Icon />
            {label}
            <MenuShortcut shortcut={shortcut} />
        </ContextMenuItem>
    );
}

/**
 * Menu entry running a registered command, labelled for the menu and showing the command's own
 * shortcut, so the menu and the keyboard always do the same thing. The entry is also greyed out
 * while the command's own enabled check refuses to run, read when the menu renders.
 *
 * @param command - Command id run through runCommand
 * @param label - Text of the entry
 * @param icon - Lucide icon drawn before the label
 * @param disabled - Greys the entry out, on top of the command's own check
 * @param destructive - Paints the entry with the destructive color
 * @returns The menu item
 */
function CommandEntry({
    command,
    label,
    icon,
    disabled,
    destructive,
}: {
    command: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    disabled?: boolean;
    destructive?: boolean;
}) {
    const definition = getCommands().find((candidate) => candidate.id === command);
    const refused = definition?.enabled ? !definition.enabled(editorApi) : false;

    return (
        <Entry
            label={label}
            icon={icon}
            shortcut={definition?.shortcuts?.[0]}
            disabled={disabled || refused}
            destructive={destructive}
            onSelect={() => runCommand(command)}
        />
    );
}

/**
 * Entries of the canvas menu, rendered only while it is open. The interaction engine has already
 * selected the element under the pointer, so the menu acts on the selection when there is one
 * (clipboard, style, order, alignment, group, lock, delete) and on the page otherwise (paste,
 * select all, grid, snapping, fit, unlock).
 *
 * @returns The entries for the current selection
 */
function CanvasMenuItems() {
    const t = useTranslations("context");
    const tc = useTranslations("common");
    const selected = useSelectedElements();
    const page = useActivePage();
    const settings = useStore(editorStore, (state) => state.settings);

    const paste = () => {
        void pasteFromClipboard(getContextPoint()).then((pasted) => {
            if (!pasted) toast.error(tc("pasteError"));
        });
    };
    const pasteEntry = (
        <Entry label={t("paste")} icon={ClipboardPaste} shortcut="mod+v" onSelect={paste} />
    );

    if (selected.length === 0) {
        const unlocked = page.elements.filter((el) => !el.locked).length;
        return (
            <>
                {pasteEntry}
                <CommandEntry
                    command="select-all"
                    label={t("selectAll")}
                    icon={SquareDashedMousePointer}
                    disabled={unlocked === 0}
                />
                <ContextMenuSeparator />
                <ContextMenuCheckboxItem
                    checked={settings.showGrid}
                    onCheckedChange={() => runCommand("toggle-grid")}
                >
                    {t("showGrid")}
                    <MenuShortcut shortcut={commandShortcut("toggle-grid")} />
                </ContextMenuCheckboxItem>
                <ContextMenuCheckboxItem
                    checked={settings.snapToGrid}
                    onCheckedChange={() => runCommand("toggle-snap")}
                >
                    {t("snap")}
                    <MenuShortcut shortcut={commandShortcut("toggle-snap")} />
                </ContextMenuCheckboxItem>
                <ContextMenuSeparator />
                <CommandEntry
                    command="zoom-fit"
                    label={t("zoomFit")}
                    icon={Maximize}
                    disabled={page.elements.length === 0}
                />
                {page.elements.length > unlocked && (
                    <CommandEntry command="unlock-all" label={t("unlockAll")} icon={LockOpen} />
                )}
            </>
        );
    }

    const editable = selected.filter((el) => !el.locked).length;
    const blocks = new Set(selected.map((el) => el.groupId ?? el.id)).size;
    const grouped = selected.some((el) => el.groupId);
    const lock = selected.some((el) => !el.locked);

    return (
        <>
            <Entry
                label={t("cut")}
                icon={Scissors}
                shortcut="mod+x"
                disabled={editable === 0}
                onSelect={() => cutSelection()}
            />
            <Entry
                label={t("copy")}
                icon={Copy}
                shortcut="mod+c"
                onSelect={() => copySelection()}
            />
            {pasteEntry}
            <CommandEntry
                command="duplicate"
                label={t("duplicate")}
                icon={CopyPlus}
                disabled={editable === 0}
            />
            <ContextMenuSeparator />
            <CommandEntry
                command="copy-style"
                label={t("copyStyle")}
                icon={Paintbrush}
                disabled={editable === 0}
            />
            <CommandEntry
                command="paste-style"
                label={t("pasteStyle")}
                icon={PaintRoller}
                disabled={editable === 0}
            />
            <ContextMenuSeparator />
            <ContextMenuSub>
                <ContextMenuSubTrigger disabled={editable === 0} className="gap-2">
                    <Layers />
                    {t("arrange")}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-60 shadow-lg">
                    <CommandEntry
                        command="bring-to-front"
                        label={t("bringToFront")}
                        icon={BringToFront}
                    />
                    <CommandEntry
                        command="bring-forward"
                        label={t("bringForward")}
                        icon={ArrowUpToLine}
                    />
                    <CommandEntry
                        command="send-backward"
                        label={t("sendBackward")}
                        icon={ArrowDownToLine}
                    />
                    <CommandEntry
                        command="send-to-back"
                        label={t("sendToBack")}
                        icon={SendToBack}
                    />
                </ContextMenuSubContent>
            </ContextMenuSub>
            {editable >= 2 && (
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2">
                        <AlignStartVertical />
                        {t("align")}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="min-w-60 shadow-lg">
                        <CommandEntry
                            command="align-left"
                            label={t("alignLeft")}
                            icon={AlignStartVertical}
                        />
                        <CommandEntry
                            command="align-center"
                            label={t("alignCenter")}
                            icon={AlignCenterVertical}
                        />
                        <CommandEntry
                            command="align-right"
                            label={t("alignRight")}
                            icon={AlignEndVertical}
                        />
                        <ContextMenuSeparator />
                        <CommandEntry
                            command="align-top"
                            label={t("alignTop")}
                            icon={AlignStartHorizontal}
                        />
                        <CommandEntry
                            command="align-middle"
                            label={t("alignMiddle")}
                            icon={AlignCenterHorizontal}
                        />
                        <CommandEntry
                            command="align-bottom"
                            label={t("alignBottom")}
                            icon={AlignEndHorizontal}
                        />
                        <ContextMenuSeparator />
                        <CommandEntry
                            command="distribute-horizontal"
                            label={t("distributeHorizontal")}
                            icon={AlignHorizontalSpaceAround}
                            disabled={editable < 3}
                        />
                        <CommandEntry
                            command="distribute-vertical"
                            label={t("distributeVertical")}
                            icon={AlignVerticalSpaceAround}
                            disabled={editable < 3}
                        />
                    </ContextMenuSubContent>
                </ContextMenuSub>
            )}
            {editable >= 2 && blocks > 1 && (
                <CommandEntry command="group" label={t("group")} icon={Group} />
            )}
            {grouped && <CommandEntry command="ungroup" label={t("ungroup")} icon={Ungroup} />}
            <CommandEntry
                command="lock"
                label={lock ? t("lock") : t("unlock")}
                icon={lock ? Lock : LockOpen}
            />
            <ContextMenuSeparator />
            <CommandEntry
                command="delete"
                label={t("delete")}
                icon={Trash2}
                disabled={editable === 0}
                destructive
            />
        </>
    );
}

/**
 * Right-click menu of the canvas (long press on touch screens). Wraps the canvas in the menu
 * trigger; it stays off while a text is edited in place so the browser menu (spelling, copy,
 * paste) keeps working in the text field.
 *
 * @param children - Canvas, filling the editor behind the islands
 * @returns The canvas wrapped in the menu trigger, with the menu content
 */
export function CanvasMenu({ children }: { children: ReactNode }) {
    const editing = useStore(editorStore, (state) => state.editingId !== null);

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild disabled={editing}>
                <div className="absolute inset-0">{children}</div>
            </ContextMenuTrigger>
            <GuardedMenuContent className="min-w-60 shadow-lg">
                <CanvasMenuItems />
            </GuardedMenuContent>
        </ContextMenu>
    );
}
