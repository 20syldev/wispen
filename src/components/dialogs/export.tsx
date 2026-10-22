"use client";

import {
    Copy,
    Download,
    FileBraces,
    FileCode,
    File as FileIcon,
    FileImage,
    FileText,
    ImageOff,
    LoaderCircle,
    type LucideIcon,
    Shapes,
    X,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStore } from "@/hooks/useStore";
import { rememberFocus, restoreFocus } from "@/lib/editor/focus";
import { ClipboardError, copyPng, copySvg } from "@/lib/export/clipboard";
import { renderStandaloneSvg } from "@/lib/export/pipeline";
import { activePage, defaultFilename, scopePages } from "@/lib/export/scope";
import { getExporters, localize } from "@/lib/registry";
import { downloadBlob, safeFilename } from "@/lib/storage/download";
import { documentStore } from "@/lib/stores/document";
import { editorStore, openDialog } from "@/lib/stores/editor";
import { localeStore } from "@/lib/stores/locale";
import { cn } from "@/lib/utils";
import type {
    ExporterDefinition,
    ExportInput,
    ExportOption,
    ExportOptions,
    ExportScope,
} from "@/types/plugin";
import type { Page, WispenDocument, WispenElement } from "@/types/scene";
import type { ThemeName } from "@/types/settings";

interface ExportPrefs {
    format: string;
    background: boolean;
    theme: ThemeName | null;
    scale: number;
    padding: number;
    embedFonts: boolean;
}

interface PreviewRequest {
    elements: WispenElement[];
    background: boolean;
    theme: ThemeName;
    padding: number;
}

interface PreviewResult extends PreviewRequest {
    url: string | null;
    width: number;
    height: number;
}

type Action = "download" | "copy";

interface ExportTarget {
    exporter: ExporterDefinition;
    scopes: ExportScope[];
    selection: boolean;
    scope: ExportScope | undefined;
    pages: Page[];
    previewElements: WispenElement[];
}

const DEFAULT_PREFS: ExportPrefs = {
    format: "png",
    background: true,
    theme: null,
    scale: 2,
    padding: 32,
    embedFonts: true,
};

// Pixel ratios offered for raster exports.
const SCALES = [1, 2, 3];

// Margins offered around the exported content, in scene pixels.
const PADDINGS = [0, 16, 32, 64];

// Debounce delay of the preview render, in milliseconds.
const PREVIEW_DELAY = 180;

// Icon of each exporter id; ids without an entry fall back to a generic file icon.
const FORMAT_ICONS: Record<string, LucideIcon> = {
    png: FileImage,
    svg: FileCode,
    pdf: FileText,
    wispen: FileBraces,
};

// Shared empty list, so the preview request keeps the same reference while nothing is drawn.
const NO_ELEMENTS: WispenElement[] = [];

// Translation key of the empty-state message, per export scope.
const EMPTY_LABELS = {
    selection: "emptySelection",
    page: "emptyPage",
    document: "emptyDocument",
} as const satisfies Record<ExportScope, string>;

// Tailwind classes drawing a transparency checkerboard behind a background-less preview.
const CHECKERBOARD =
    "bg-[repeating-conic-gradient(var(--muted)_0_25%,var(--card)_0_50%)] bg-[length:16px_16px]";

/**
 * Tells whether some selected elements belong to the active page.
 *
 * @param document - Document whose active page is searched
 * @param selectedIds - Selected element ids, possibly stale
 * @returns true when the selection scope has something to export
 */
function hasSelectedElements(document: WispenDocument, selectedIds: string[]): boolean {
    const selected = new Set(selectedIds);
    return activePage(document).elements.some((element) => selected.has(element.id));
}

/**
 * Resolves the exporter, the scope and the pages of an export from the dialog choices. The
 * selection scope is only chosen when something is selected.
 *
 * @param document - Document whose pages are exported
 * @param selectedIds - Selected element ids, used by the selection scope
 * @param format - Exporter id chosen in the dialog; unknown ids fall back to the first exporter
 * @param preferred - Scope chosen in the dialog, replaced by "page" (or the first supported
 * scope) when the format does not offer it
 * @returns The export target
 */
function resolveTarget(
    document: WispenDocument,
    selectedIds: string[],
    format: string,
    preferred: ExportScope,
): ExportTarget {
    const exporters = getExporters();
    const exporter = exporters.find((entry) => entry.id === format) ?? exporters[0];
    const selection = hasSelectedElements(document, selectedIds);
    const available = exporter.scopes.filter((entry) => entry !== "selection" || selection);
    const scope = available.includes(preferred)
        ? preferred
        : available.includes("page")
          ? "page"
          : available[0];
    const pages = scope ? scopePages(document, selectedIds, scope) : [];
    const previewPage =
        scope === "document"
            ? [activePage(document), ...pages].find((page) => page.elements.length > 0)
            : pages[0];
    const previewElements = previewPage?.elements ?? NO_ELEMENTS;
    return { exporter, scopes: exporter.scopes, selection, scope, pages, previewElements };
}

/**
 * Labelled block of the options column; the label names the control group for assistive
 * technologies.
 *
 * @param label - Visible caption above the controls
 * @param children - Inputs rendered under the caption, inside the labelled group
 * @returns A group named by its caption
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
    const id = useId();
    return (
        <div role="group" aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
            <span id={id} className="text-xs font-medium text-muted-foreground">
                {label}
            </span>
            {children}
        </div>
    );
}

/**
 * Segmented control: a muted track whose pressed segment is raised, as in the properties panel.
 *
 * @param label - Accessible name of the control
 * @param value - Value of the pressed segment
 * @param items - Segments, in display order; disabled ones stay visible but cannot be pressed
 * @param onChange - Called with the value of the newly pressed segment
 * @returns A single-choice toggle group spanning the column width
 */
function Segmented({
    label,
    value,
    items,
    onChange,
}: {
    label: string;
    value: string;
    items: { value: string; label: string; disabled?: boolean }[];
    onChange: (value: string) => void;
}) {
    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(next) => next && onChange(next)}
            aria-label={label}
            spacing={1}
            className="glide glide-raised segment-track w-full"
        >
            {items.map((item) => (
                <ToggleGroupItem
                    key={item.value}
                    value={item.value}
                    disabled={item.disabled}
                    className="segment-item"
                >
                    {item.label}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}

/**
 * Row of the options list: a label and its switch.
 *
 * @param label - Visible name of the option
 * @param hint - Optional secondary line under the label
 * @param checked - Controlled on/off value of the switch, mirrored in the export option it toggles
 * @param onChange - Called with the new on/off value each time the switch is toggled
 * @returns The row, whose whole label toggles the switch
 */
function SwitchRow({
    label,
    hint,
    checked,
    onChange,
}: {
    label: string;
    hint?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    const id = useId();
    return (
        <div className="flex items-center justify-between gap-4 px-3 py-2.5">
            <Label htmlFor={id} className="flex-col items-start gap-0.5 font-normal">
                <span className="text-sm">{label}</span>
                {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
            </Label>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </div>
    );
}

/**
 * Live preview of the export: the SVG rendering of the current scope, shown as an image on the
 * canvas color, or on a checkerboard when the background is left out. The surface takes the
 * theme of the export, so a transparent dark picture is previewed on dark tones. Renders are
 * debounced and their Blob URLs revoked as soon as they are replaced.
 *
 * @param elements - Elements to draw; an empty list shows the empty state
 * @param background - Paints the canvas color behind the elements
 * @param theme - Theme whose palette is used
 * @param padding - Margin around the content, in scene pixels
 * @param scale - Pixel ratio applied to the displayed dimensions; null hides them, for outputs
 * that are not images
 * @param emptyLabel - Message shown when there is nothing to draw
 * @param caption - Secondary text under the preview, the page count for documents
 * @returns The preview surface, followed by its caption and the output size
 */
function Preview({
    elements,
    background,
    theme,
    padding,
    scale,
    emptyLabel,
    caption,
}: PreviewRequest & {
    scale: number | null;
    emptyLabel: string;
    caption: string | null;
}) {
    const t = useTranslations("export");
    const [result, setResult] = useState<PreviewResult | null>(null);

    useEffect(() => {
        if (elements.length === 0) return;
        const request = { elements, background, theme, padding };
        let cancelled = false;
        const timer = window.setTimeout(() => {
            renderStandaloneSvg(elements, request, true).then(
                (rendered) => {
                    if (cancelled) return;
                    const blob = new Blob([rendered.svg], { type: "image/svg+xml" });
                    setResult({
                        ...request,
                        url: URL.createObjectURL(blob),
                        width: rendered.width,
                        height: rendered.height,
                    });
                },
                () => {
                    if (!cancelled) setResult({ ...request, url: null, width: 0, height: 0 });
                },
            );
        }, PREVIEW_DELAY);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [elements, background, theme, padding]);

    const url = result?.url;
    useEffect(() => {
        if (!url) return;
        return () => URL.revokeObjectURL(url);
    }, [url]);

    const empty = elements.length === 0;
    const pending =
        !result ||
        result.elements !== elements ||
        result.background !== background ||
        result.theme !== theme ||
        result.padding !== padding;
    const failed = !pending && !result?.url;

    return (
        <section
            aria-label={t("preview")}
            className="flex min-w-0 flex-col gap-3 border-b border-border bg-muted/50 p-4 md:border-r md:border-b-0 md:p-5"
        >
            <div
                className={cn(
                    "relative h-56 overflow-hidden rounded-md border border-border sm:h-72 md:h-auto md:min-h-[26rem] md:flex-1",
                    !empty && !background ? CHECKERBOARD : "bg-muted",
                    !empty && theme,
                )}
            >
                {empty ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                        <Shapes className="size-6 text-muted-foreground" strokeWidth={1.75} />
                        <p className="text-sm font-medium">{emptyLabel}</p>
                        <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
                    </div>
                ) : failed ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                        <ImageOff className="size-6" strokeWidth={1.75} />
                        {t("previewError")}
                    </div>
                ) : (
                    <>
                        {url && (
                            <Image
                                src={url}
                                alt={t("previewAlt")}
                                fill
                                unoptimized
                                className={cn(
                                    "object-contain p-5 transition-opacity duration-200",
                                    background && "drop-shadow-md",
                                    pending && "opacity-50",
                                )}
                            />
                        )}
                        {pending && (
                            <div
                                role="status"
                                className="absolute inset-0 flex items-center justify-center"
                            >
                                <LoaderCircle
                                    className="size-5 animate-spin text-muted-foreground"
                                    strokeWidth={1.75}
                                />
                                <span className="sr-only">{t("previewLoading")}</span>
                            </div>
                        )}
                    </>
                )}
            </div>
            <div className="flex min-h-4 items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">{caption ?? t("preview")}</span>
                {!empty && scale !== null && result?.url && (
                    <span className="shrink-0 font-num tabular-nums">
                        {t("size", {
                            width: Math.round(result.width * scale),
                            height: Math.round(result.height * scale),
                        })}
                    </span>
                )}
            </div>
        </section>
    );
}

/**
 * Content of the open dialog: the preview and the options column. Mounted on every opening,
 * so the scope and the file name start from the current selection and document, while the
 * format and rendering options come from the preferences kept by ExportDialog.
 *
 * @param prefs - Format and options remembered for the session
 * @param onPrefsChange - Stores updated preferences
 * @returns The preview column next to the options form
 */
function ExportPanel({
    prefs,
    onPrefsChange,
}: {
    prefs: ExportPrefs;
    onPrefsChange: (prefs: ExportPrefs) => void;
}) {
    const t = useTranslations("export");
    const tc = useTranslations("common");
    const locale = useStore(localeStore, (state) => state.locale);
    const document = useStore(documentStore, (state) => state.document);
    const selectedIds = useStore(editorStore, (state) => state.selectedIds);
    const { resolvedTheme } = useTheme();

    const [preferredScope, setPreferredScope] = useState<ExportScope>(() =>
        hasSelectedElements(document, selectedIds) ? "selection" : "page",
    );
    const [customName, setCustomName] = useState<string | null>(null);
    const [busy, setBusy] = useState<Action | null>(null);
    const fileNameId = useId();

    const { exporter, scopes, selection, scope, pages, previewElements } = useMemo(
        () => resolveTarget(document, selectedIds, prefs.format, preferredScope),
        [document, selectedIds, prefs.format, preferredScope],
    );
    const exporters = getExporters();
    const declares = (option: ExportOption) => exporter.options.includes(option);

    const appTheme: ThemeName = resolvedTheme === "dark" ? "dark" : "light";
    const options: Omit<ExportOptions, "scope"> = {
        background: prefs.background,
        theme: prefs.theme ?? appTheme,
        scale: prefs.scale,
        padding: prefs.padding,
        embedFonts: prefs.embedFonts,
    };

    const fileName =
        customName ?? (scope ? defaultFilename(document, scope) : safeFilename(document.name));
    const nothingToExport =
        !scope || (scope !== "document" && pages.every((entry) => entry.elements.length === 0));
    const canCopy = exporter.id === "png" || exporter.id === "svg";
    const producesImage = exporter.mimeType.startsWith("image/");
    const pixelRatio = declares("scale") ? options.scale : 1;
    const hint = t.has(`hints.${exporter.id}`) ? t(`hints.${exporter.id}`) : null;

    const update = (patch: Partial<ExportPrefs>) => onPrefsChange({ ...prefs, ...patch });

    const run = async (action: Action) => {
        if (!scope || busy) return;
        const input: ExportInput = { document, pages, options: { ...options, scope } };
        const name = `${safeFilename(fileName)}.${exporter.extension}`;
        setBusy(action);
        try {
            if (action === "download") {
                downloadBlob(await exporter.export(input), name);
                toast.success(t("downloaded", { name }));
            } else if (exporter.id === "svg") {
                await copySvg(exporter.export(input).then((blob) => blob.text()));
                toast.success(t("copiedSvg"));
            } else {
                await copyPng(exporter.export(input));
                toast.success(t("copiedPng"));
            }
            openDialog(null);
        } catch (error) {
            console.error(error);
            if (error instanceof ClipboardError) {
                toast.error(t(error.reason === "unsupported" ? "copyUnsupported" : "copyDenied"));
            } else {
                toast.error(t("failed"));
            }
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            <Preview
                elements={previewElements}
                background={declares("background") ? options.background : true}
                theme={declares("theme") ? options.theme : appTheme}
                padding={declares("padding") ? options.padding : DEFAULT_PREFS.padding}
                scale={producesImage ? pixelRatio : null}
                emptyLabel={t(EMPTY_LABELS[scope ?? "page"])}
                caption={scope === "document" ? t("pageCount", { count: pages.length }) : null}
            />

            <form
                className="flex min-w-0 flex-col gap-5 p-5 md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto md:p-6"
                onSubmit={(event) => {
                    event.preventDefault();
                    void run("download");
                }}
            >
                <header className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                        <DialogTitle>{t("title")}</DialogTitle>
                        <DialogDescription className="text-[13px]">
                            {t("description")}
                        </DialogDescription>
                    </div>
                    <DialogClose
                        type="button"
                        className="overlay-close -mt-1 -mr-2 shrink-0"
                        aria-label={tc("close")}
                    >
                        <X className="size-4" strokeWidth={1.75} />
                    </DialogClose>
                </header>

                <Field label={t("format")}>
                    <ToggleGroup
                        type="single"
                        value={exporter.id}
                        onValueChange={(next) => next && update({ format: next })}
                        spacing={2}
                        className="grid w-full grid-cols-2 gap-2"
                    >
                        {exporters.map((entry) => {
                            const Icon = FORMAT_ICONS[entry.id] ?? FileIcon;
                            const active = entry.id === exporter.id;
                            return (
                                <ToggleGroupItem
                                    key={entry.id}
                                    value={entry.id}
                                    className="overlay-choice relative h-auto min-h-14 w-full self-stretch justify-start gap-2 px-2 py-2.5 text-left whitespace-normal sm:gap-2.5 sm:px-2.5"
                                >
                                    {active && <span className="toggle-dot" />}
                                    <Icon
                                        className={cn(
                                            "size-5 shrink-0",
                                            active ? "text-foreground" : "text-muted-foreground",
                                        )}
                                        strokeWidth={1.75}
                                    />
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="text-[13px] leading-snug font-medium sm:text-sm">
                                            {localize(entry.label, locale)}
                                        </span>
                                        <span className="font-mono text-[11px] text-muted-foreground">
                                            .{entry.extension}
                                        </span>
                                    </span>
                                </ToggleGroupItem>
                            );
                        })}
                    </ToggleGroup>
                    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                </Field>

                {scope && (
                    <Field label={t("scope")}>
                        <Segmented
                            label={t("scope")}
                            value={scope}
                            items={scopes.map((entry) => ({
                                value: entry,
                                label: t(`scopes.${entry}`),
                                disabled: entry === "selection" && !selection,
                            }))}
                            onChange={(next) => setPreferredScope(next as ExportScope)}
                        />
                    </Field>
                )}

                {(declares("scale") || declares("padding")) && (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        {declares("scale") && (
                            <Field label={t("scale")}>
                                <Segmented
                                    label={t("scale")}
                                    value={String(options.scale)}
                                    items={SCALES.map((value) => ({
                                        value: String(value),
                                        label: `${value}x`,
                                    }))}
                                    onChange={(next) => update({ scale: Number(next) })}
                                />
                            </Field>
                        )}
                        {declares("padding") && (
                            <Field label={t("padding")}>
                                <Segmented
                                    label={t("paddingLabel")}
                                    value={String(options.padding)}
                                    items={PADDINGS.map((value) => ({
                                        value: String(value),
                                        label: String(value),
                                    }))}
                                    onChange={(next) => update({ padding: Number(next) })}
                                />
                            </Field>
                        )}
                    </div>
                )}

                {(declares("background") || declares("theme") || declares("embedFonts")) && (
                    <div className="divide-y divide-border rounded-md border border-border bg-card">
                        {declares("background") && (
                            <SwitchRow
                                label={t("background")}
                                checked={options.background}
                                onChange={(checked) => update({ background: checked })}
                            />
                        )}
                        {declares("theme") && (
                            <SwitchRow
                                label={t("darkTheme")}
                                checked={options.theme === "dark"}
                                onChange={(checked) =>
                                    update({ theme: checked ? "dark" : "light" })
                                }
                            />
                        )}
                        {declares("embedFonts") && (
                            <SwitchRow
                                label={t("embedFonts")}
                                hint={t("embedFontsHint")}
                                checked={options.embedFonts}
                                onChange={(checked) => update({ embedFonts: checked })}
                            />
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <Label
                        htmlFor={fileNameId}
                        className="text-xs font-medium text-muted-foreground"
                    >
                        {t("fileName")}
                    </Label>
                    <div className="overlay-field flex h-9 items-center">
                        <Input
                            id={fileNameId}
                            value={fileName}
                            onChange={(event) => setCustomName(event.target.value)}
                            spellCheck={false}
                            autoComplete="off"
                            className="h-full flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                        />
                        <span className="pr-3 font-mono text-xs text-muted-foreground">
                            .{exporter.extension}
                        </span>
                    </div>
                </div>

                <div className="mt-auto flex gap-2 pt-1 sm:justify-end">
                    {canCopy && (
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11 flex-1 rounded-cta px-4 sm:flex-none"
                            disabled={nothingToExport || busy !== null}
                            aria-busy={busy === "copy"}
                            onClick={() => void run("copy")}
                        >
                            {busy === "copy" ? (
                                <LoaderCircle className="animate-spin" strokeWidth={1.75} />
                            ) : (
                                <Copy strokeWidth={1.75} />
                            )}
                            {t("copy")}
                        </Button>
                    )}
                    <Button
                        type="submit"
                        className="h-11 flex-1 rounded-cta px-5 font-semibold sm:flex-none"
                        disabled={nothingToExport || busy !== null}
                        aria-busy={busy === "download"}
                    >
                        {busy === "download" ? (
                            <LoaderCircle className="animate-spin" strokeWidth={1.75} />
                        ) : (
                            <Download strokeWidth={1.75} />
                        )}
                        {busy === "download" ? t("exporting") : t("download")}
                    </Button>
                </div>
            </form>
        </>
    );
}

/**
 * Export dialog, open while the editor dialog state is "export": a live preview next to the
 * format, scope and rendering options, with download and copy actions. The download button
 * takes the focus on opening, so the export shortcut followed by Enter downloads right away.
 * The chosen format and options are kept for the rest of the session; nothing is persisted.
 *
 * @returns The dialog, whose content is mounted only while it is open
 */
export function ExportDialog() {
    const open = useStore(editorStore, (state) => state.dialog === "export");
    const [prefs, setPrefs] = useState<ExportPrefs>(DEFAULT_PREFS);
    const returnFocus = useRef<HTMLElement | SVGElement | null>(null);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && openDialog(null)}>
            <DialogContent
                showCloseButton={false}
                onCloseAutoFocus={(event) => restoreFocus(event, returnFocus)}
                onOpenAutoFocus={(event) => {
                    rememberFocus(returnFocus);
                    const action = (
                        event.currentTarget as HTMLElement | null
                    )?.querySelector<HTMLButtonElement>("button[type=submit]:not(:disabled)");
                    if (!action) return;
                    event.preventDefault();
                    action.focus({ preventScroll: true });
                }}
                className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[58rem] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:overflow-hidden"
            >
                <ExportPanel prefs={prefs} onPrefsChange={setPrefs} />
            </DialogContent>
        </Dialog>
    );
}
