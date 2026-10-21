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
    ArrowLeft,
    ArrowRight,
    ArrowUpToLine,
    Bold,
    BringToFront,
    Copy,
    Download,
    FilePlus,
    FolderOpen,
    Grid3x3,
    Group,
    Italic,
    Keyboard,
    Lock,
    LockOpen,
    Magnet,
    Maximize,
    Paintbrush,
    Palette,
    Pin,
    Plus,
    Redo2,
    Save,
    SaveAll,
    Scan,
    SendToBack,
    SquareDashedMousePointer,
    SunMoon,
    Trash2,
    Underline,
    Undo2,
    Ungroup,
    ZoomIn,
    ZoomOut,
} from "lucide-react";

import { zoomBy, zoomTo, zoomToFit, zoomToSelection } from "@/lib/canvas/viewport";
import {
    addPage,
    alignSelection,
    applyStyle,
    arrangeSelection,
    copyStyle,
    cyclePage,
    deleteSelection,
    distributeSelection,
    duplicateSelection,
    groupSelection,
    hasCopiedStyle,
    pasteStyle,
    selectAll,
    toggleGrid,
    toggleLockSelection,
    toggleSnap,
    toggleToolLock,
    ungroupSelection,
    unlockAll,
} from "@/lib/editor/actions";
import { editorApi } from "@/lib/editor/api";
import { getPluginCommands, getShape } from "@/lib/registry";
import { newDocument, openFile, saveFile, saveFileAs } from "@/lib/storage/files";
import { getElements, getSelectedElements, redo, undo } from "@/lib/stores/document";
import { editorStore, openDialog, updateSettings } from "@/lib/stores/editor";
import { toggleTheme } from "@/lib/theme";
import type { CommandDefinition } from "@/types/plugin";

/**
 * Tells whether at least `count` unlocked elements are selected.
 *
 * @param count - Minimum number of selected elements, locked ones not counted
 * @returns true when the unlocked part of the selection reaches that size
 */
function selection(count: number): boolean {
    return getSelectedElements().filter((el) => !el.locked).length >= count;
}

/**
 * Toggles a text style on the selected elements that carry text, based on the first one.
 *
 * @param key - Style property of the elements to switch
 * @param on - Value applied when the first element does not have it yet
 * @param off - Value applied when the first element already has the "on" value
 */
function toggleText<K extends "fontWeight" | "fontStyle" | "textDecoration">(
    key: K,
    on: string,
    off: string,
): void {
    const [first] = getSelectedElements().filter((el) => getShape(el.type).text);
    if (!first) return;
    applyStyle({ [key]: first[key] === on ? off : on });
}

/**
 * Built-in commands, listed in the command palette and the shortcuts dialog.
 * They are triggered by their keyboard shortcuts; plugins add theirs through WispenPlugin.commands.
 */
export const coreCommands: CommandDefinition[] = [
    {
        id: "new-document",
        label: { en: "New document", fr: "Nouveau document" },
        group: "file",
        icon: FilePlus,
        run: () => newDocument(),
    },
    {
        id: "open-file",
        label: { en: "Open a file", fr: "Ouvrir un fichier" },
        group: "file",
        icon: FolderOpen,
        shortcuts: ["mod+o"],
        run: () => openFile(),
    },
    {
        id: "save-file",
        label: { en: "Save to a file", fr: "Enregistrer dans un fichier" },
        group: "file",
        icon: Save,
        shortcuts: ["mod+s"],
        run: () => saveFile(),
    },
    {
        id: "save-file-as",
        label: { en: "Save as", fr: "Enregistrer sous" },
        group: "file",
        icon: SaveAll,
        shortcuts: ["mod+shift+s"],
        run: () => saveFileAs(),
    },
    {
        id: "export",
        label: { en: "Export", fr: "Exporter" },
        group: "file",
        icon: Download,
        shortcuts: ["mod+shift+e"],
        run: () => openDialog("export"),
    },
    {
        id: "documents",
        label: { en: "My documents", fr: "Mes documents" },
        group: "file",
        icon: FolderOpen,
        shortcuts: ["mod+shift+o"],
        run: () => openDialog("documents"),
    },
    {
        id: "undo",
        label: { en: "Undo", fr: "Annuler" },
        group: "edit",
        icon: Undo2,
        shortcuts: ["mod+z"],
        run: () => undo(),
    },
    {
        id: "redo",
        label: { en: "Redo", fr: "Rétablir" },
        group: "edit",
        icon: Redo2,
        shortcuts: ["mod+shift+z", "mod+y"],
        run: () => redo(),
    },
    {
        id: "select-all",
        label: { en: "Select all", fr: "Tout sélectionner" },
        group: "edit",
        icon: SquareDashedMousePointer,
        shortcuts: ["mod+a"],
        run: () => selectAll(),
    },
    {
        id: "duplicate",
        label: { en: "Duplicate", fr: "Dupliquer" },
        group: "edit",
        icon: Copy,
        shortcuts: ["mod+d"],
        enabled: () => selection(1),
        run: () => duplicateSelection(),
    },
    {
        id: "delete",
        label: { en: "Delete", fr: "Supprimer" },
        group: "edit",
        icon: Trash2,
        shortcuts: ["delete", "backspace"],
        enabled: () => selection(1),
        run: () => deleteSelection(),
    },
    {
        id: "copy-style",
        label: { en: "Copy style", fr: "Copier le style" },
        group: "edit",
        icon: Paintbrush,
        shortcuts: ["mod+alt+c"],
        enabled: () => selection(1),
        run: () => copyStyle(),
    },
    {
        id: "paste-style",
        label: { en: "Paste style", fr: "Coller le style" },
        group: "edit",
        icon: Paintbrush,
        shortcuts: ["mod+alt+v"],
        enabled: () => selection(1) && hasCopiedStyle(),
        run: () => pasteStyle(),
    },
    {
        id: "bring-forward",
        label: { en: "Bring forward", fr: "Avancer" },
        group: "arrange",
        icon: ArrowUpToLine,
        shortcuts: ["mod+]"],
        enabled: () => selection(1),
        run: () => arrangeSelection("forward"),
    },
    {
        id: "send-backward",
        label: { en: "Send backward", fr: "Reculer" },
        group: "arrange",
        icon: ArrowDownToLine,
        shortcuts: ["mod+["],
        enabled: () => selection(1),
        run: () => arrangeSelection("backward"),
    },
    {
        id: "bring-to-front",
        label: { en: "Bring to front", fr: "Mettre au premier plan" },
        group: "arrange",
        icon: BringToFront,
        shortcuts: ["mod+shift+]"],
        enabled: () => selection(1),
        run: () => arrangeSelection("front"),
    },
    {
        id: "send-to-back",
        label: { en: "Send to back", fr: "Mettre à l'arrière-plan" },
        group: "arrange",
        icon: SendToBack,
        shortcuts: ["mod+shift+["],
        enabled: () => selection(1),
        run: () => arrangeSelection("back"),
    },
    {
        id: "group",
        label: { en: "Group", fr: "Grouper" },
        group: "arrange",
        icon: Group,
        shortcuts: ["mod+g"],
        enabled: () => selection(2),
        run: () => groupSelection(),
    },
    {
        id: "ungroup",
        label: { en: "Ungroup", fr: "Dégrouper" },
        group: "arrange",
        icon: Ungroup,
        shortcuts: ["mod+shift+g"],
        enabled: () => getSelectedElements().some((el) => el.groupId),
        run: () => ungroupSelection(),
    },
    {
        id: "lock",
        label: { en: "Lock or unlock", fr: "Verrouiller ou déverrouiller" },
        group: "arrange",
        icon: Lock,
        shortcuts: ["mod+shift+l"],
        enabled: () => getSelectedElements().length > 0,
        run: () => toggleLockSelection(),
    },
    {
        id: "unlock-all",
        label: { en: "Unlock everything", fr: "Tout déverrouiller" },
        group: "arrange",
        icon: LockOpen,
        enabled: () => getElements().some((el) => el.locked),
        run: () => unlockAll(),
    },
    {
        id: "align-left",
        label: { en: "Align left", fr: "Aligner à gauche" },
        group: "arrange",
        icon: AlignStartVertical,
        shortcuts: ["mod+shift+arrowleft"],
        enabled: () => selection(2),
        run: () => alignSelection("left"),
    },
    {
        id: "align-center",
        label: { en: "Center horizontally", fr: "Centrer horizontalement" },
        group: "arrange",
        icon: AlignCenterVertical,
        enabled: () => selection(2),
        run: () => alignSelection("center"),
    },
    {
        id: "align-right",
        label: { en: "Align right", fr: "Aligner à droite" },
        group: "arrange",
        icon: AlignEndVertical,
        shortcuts: ["mod+shift+arrowright"],
        enabled: () => selection(2),
        run: () => alignSelection("right"),
    },
    {
        id: "align-top",
        label: { en: "Align top", fr: "Aligner en haut" },
        group: "arrange",
        icon: AlignStartHorizontal,
        shortcuts: ["mod+shift+arrowup"],
        enabled: () => selection(2),
        run: () => alignSelection("top"),
    },
    {
        id: "align-middle",
        label: { en: "Center vertically", fr: "Centrer verticalement" },
        group: "arrange",
        icon: AlignCenterHorizontal,
        enabled: () => selection(2),
        run: () => alignSelection("middle"),
    },
    {
        id: "align-bottom",
        label: { en: "Align bottom", fr: "Aligner en bas" },
        group: "arrange",
        icon: AlignEndHorizontal,
        shortcuts: ["mod+shift+arrowdown"],
        enabled: () => selection(2),
        run: () => alignSelection("bottom"),
    },
    {
        id: "distribute-horizontal",
        label: { en: "Distribute horizontally", fr: "Répartir horizontalement" },
        group: "arrange",
        icon: AlignHorizontalSpaceAround,
        shortcuts: ["alt+h"],
        enabled: () => selection(3),
        run: () => distributeSelection("horizontal"),
    },
    {
        id: "distribute-vertical",
        label: { en: "Distribute vertically", fr: "Répartir verticalement" },
        group: "arrange",
        icon: AlignVerticalSpaceAround,
        shortcuts: ["alt+v"],
        enabled: () => selection(3),
        run: () => distributeSelection("vertical"),
    },
    {
        id: "bold",
        label: { en: "Bold", fr: "Gras" },
        group: "text",
        icon: Bold,
        shortcuts: ["mod+b"],
        enabled: () => getSelectedElements().some((el) => getShape(el.type).text),
        run: () => toggleText("fontWeight", "bold", "normal"),
    },
    {
        id: "italic",
        label: { en: "Italic", fr: "Italique" },
        group: "text",
        icon: Italic,
        shortcuts: ["mod+i"],
        enabled: () => getSelectedElements().some((el) => getShape(el.type).text),
        run: () => toggleText("fontStyle", "italic", "normal"),
    },
    {
        id: "underline",
        label: { en: "Underline", fr: "Souligné" },
        group: "text",
        icon: Underline,
        shortcuts: ["mod+u"],
        enabled: () => getSelectedElements().some((el) => getShape(el.type).text),
        run: () => toggleText("textDecoration", "underline", "none"),
    },
    {
        id: "zoom-in",
        label: { en: "Zoom in", fr: "Zoom avant" },
        group: "view",
        icon: ZoomIn,
        shortcuts: ["mod+=", "mod++"],
        run: () => zoomBy(1.2),
    },
    {
        id: "zoom-out",
        label: { en: "Zoom out", fr: "Zoom arrière" },
        group: "view",
        icon: ZoomOut,
        shortcuts: ["mod+-"],
        run: () => zoomBy(1 / 1.2),
    },
    {
        id: "zoom-reset",
        label: { en: "Reset zoom", fr: "Réinitialiser le zoom" },
        group: "view",
        icon: Scan,
        shortcuts: ["mod+0", "shift+0"],
        run: () => zoomTo(1),
    },
    {
        id: "zoom-fit",
        label: { en: "Zoom to fit", fr: "Tout afficher" },
        group: "view",
        icon: Maximize,
        shortcuts: ["shift+1"],
        run: () => zoomToFit(),
    },
    {
        id: "zoom-selection",
        label: { en: "Zoom to selection", fr: "Zoomer sur la sélection" },
        group: "view",
        icon: Maximize,
        shortcuts: ["shift+2"],
        run: () => zoomToSelection(),
    },
    {
        id: "toggle-grid",
        label: { en: "Show or hide the grid", fr: "Afficher ou masquer la grille" },
        group: "view",
        icon: Grid3x3,
        shortcuts: ["mod+'"],
        run: () => toggleGrid(),
    },
    {
        id: "toggle-snap",
        label: { en: "Snap to grid", fr: "Magnétisme de la grille" },
        group: "view",
        icon: Magnet,
        shortcuts: ["alt+s"],
        run: () => toggleSnap(),
    },
    {
        id: "toggle-theme",
        label: { en: "Toggle dark mode", fr: "Basculer le mode sombre" },
        group: "view",
        icon: SunMoon,
        shortcuts: ["alt+shift+d"],
        run: () => toggleTheme(),
    },
    {
        id: "command-palette",
        label: { en: "Command palette", fr: "Palette de commandes" },
        group: "view",
        icon: Keyboard,
        shortcuts: ["mod+k", "mod+shift+p"],
        run: () => openDialog("palette"),
    },
    {
        id: "shortcuts",
        label: { en: "Keyboard shortcuts", fr: "Raccourcis clavier" },
        group: "view",
        icon: Keyboard,
        shortcuts: ["?"],
        run: () => openDialog("shortcuts"),
    },
    {
        id: "tool-lock",
        label: { en: "Keep the tool active", fr: "Garder l'outil actif" },
        group: "tool",
        icon: Pin,
        shortcuts: ["q"],
        run: () => toggleToolLock(),
    },
    {
        id: "new-page",
        label: { en: "New page", fr: "Nouvelle page" },
        group: "page",
        icon: Plus,
        shortcuts: ["alt+n"],
        run: () => addPage(),
    },
    {
        id: "next-page",
        label: { en: "Next page", fr: "Page suivante" },
        group: "page",
        icon: ArrowRight,
        shortcuts: ["alt+pagedown"],
        run: () => cyclePage(1),
    },
    {
        id: "previous-page",
        label: { en: "Previous page", fr: "Page précédente" },
        group: "page",
        icon: ArrowLeft,
        shortcuts: ["alt+pageup"],
        run: () => cyclePage(-1),
    },
    {
        id: "toggle-canvas-tint",
        label: { en: "White or tinted canvas", fr: "Canevas blanc ou teinté" },
        group: "view",
        icon: Palette,
        run: () =>
            updateSettings({
                canvas: editorStore.getState().settings.canvas === "white" ? "tinted" : "white",
            }),
    },
];

/**
 * Lists every command: built-in ones first, then those contributed by plugins.
 *
 * @returns Core commands first, then plugin commands in registration order
 */
export function getCommands(): CommandDefinition[] {
    const core = new Set(coreCommands.map((command) => command.id));
    return [...coreCommands, ...getPluginCommands().filter((command) => !core.has(command.id))];
}

/**
 * Runs a command by id when it is currently enabled.
 *
 * @param id - Id of a core or plugin command such as "bold"; unknown ids do nothing
 * @returns true when the command ran, false when it is unknown or currently disabled
 */
export function runCommand(id: string): boolean {
    const command = getCommands().find((candidate) => candidate.id === id);
    if (!command || (command.enabled && !command.enabled(editorApi))) return false;
    void command.run(editorApi);
    return true;
}
