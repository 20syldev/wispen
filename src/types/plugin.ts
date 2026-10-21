import type { ComponentType } from "react";

import type { Bounds, Page, Point, WispenDocument, WispenElement } from "@/types/scene";
import type { Locale, ThemeName } from "@/types/settings";

export type LocalizedString = string | ({ en: string } & Partial<Record<Locale, string>>);

export type ColorTone = "stroke" | "fill";

export interface RenderContext {
    color: (value: string, tone: ColorTone) => string;
    font: (id: string) => string;
    mode: "screen" | "export";
    editingId: string | null;
}

export interface ShapeProps {
    element: WispenElement;
    ctx: RenderContext;
}

export type ShapeKind = "box" | "linear" | "freedraw";

export interface ShapeDefinition {
    type: string;
    label: LocalizedString;
    kind: ShapeKind;
    text?: "label" | "content";
    fill?: boolean;
    radius?: boolean;
    keepAspectRatio?: boolean;
    bindable?: boolean;
    defaults?: Partial<WispenElement>;
    defaultSize?: { width: number; height: number };
    Component: ComponentType<ShapeProps>;
    hitTest?: (element: WispenElement, point: Point, tolerance: number) => boolean;
    outline?: (element: WispenElement, toward: Point) => Point;
    textBounds?: (element: WispenElement) => Bounds;
    paintMargin?: (element: WispenElement) => number;
}

export interface ToolDefinition {
    id: string;
    label: LocalizedString;
    icon: ComponentType<{ className?: string }>;
    shortcuts?: string[];
    shape?: string;
    run?: (api: EditorApi) => void;
    placement?: "main" | "more";
}

export type CommandGroup =
    "file" | "edit" | "view" | "arrange" | "text" | "page" | "tool" | "plugin";

export interface CommandDefinition {
    id: string;
    label: LocalizedString;
    group: CommandGroup;
    icon?: ComponentType<{ className?: string }>;
    shortcuts?: string[];
    run: (api: EditorApi) => void | Promise<void>;
    enabled?: (api: EditorApi) => boolean;
}

export type ExportScope = "selection" | "page" | "document";

export interface ExportOptions {
    scope: ExportScope;
    background: boolean;
    theme: ThemeName;
    scale: number;
    padding: number;
    embedFonts: boolean;
}

export interface ExportInput {
    document: WispenDocument;
    pages: Page[];
    options: ExportOptions;
}

export type ExportOption = "background" | "theme" | "scale" | "padding" | "embedFonts";

export interface ExporterDefinition {
    id: string;
    label: LocalizedString;
    extension: string;
    mimeType: string;
    scopes: ExportScope[];
    options: ExportOption[];
    export: (input: ExportInput) => Promise<Blob>;
}

export type ImportResult =
    | { kind: "document"; document: WispenDocument }
    | { kind: "elements"; elements: WispenElement[] };

export interface ImporterDefinition {
    id: string;
    label: LocalizedString;
    accept: string[];
    match: (file: File, text: string) => boolean;
    import: (file: File, text: string) => Promise<ImportResult>;
}

export interface WispenPlugin {
    id: string;
    name: LocalizedString;
    description?: LocalizedString;
    shapes?: ShapeDefinition[];
    tools?: ToolDefinition[];
    commands?: CommandDefinition[];
    exporters?: ExporterDefinition[];
    importers?: ImporterDefinition[];
}

export type ElementPatch = Partial<Omit<WispenElement, "id">>;

export interface EditorApi {
    getDocument: () => WispenDocument;
    getActivePage: () => Page;
    getSelectedElements: () => WispenElement[];
    select: (ids: string[]) => void;
    createElement: (type: string, patch?: ElementPatch) => WispenElement;
    addElements: (elements: WispenElement[], options?: { select?: boolean }) => void;
    updateElements: (
        ids: string[],
        patch: ElementPatch | ((element: WispenElement) => ElementPatch),
    ) => void;
    deleteElements: (ids: string[]) => void;
    setTool: (id: string) => void;
    getViewportCenter: () => Point;
    notify: (message: string, kind?: "success" | "error" | "info") => void;
    locale: () => Locale;
}
