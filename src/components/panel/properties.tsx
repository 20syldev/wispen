"use client";

import { Layers, SlidersHorizontal, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    createElement,
    type CSSProperties,
    useEffect,
    useId,
    useMemo,
    useState,
    useSyncExternalStore,
} from "react";

import { Island } from "@/components/island";
import { ArrangeFields } from "@/components/panel/arrange";
import { FieldSeparator } from "@/components/panel/field";
import { FocusGuard } from "@/components/panel/focus";
import { Range } from "@/components/panel/range";
import { StyleFields, type StyleSections } from "@/components/panel/style";
import { Tip } from "@/components/panel/tip";
import { TextFields } from "@/components/panel/typo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TRANSPARENT } from "@/data/palette";
import { useStore } from "@/hooks/useStore";
import { applyStyle } from "@/lib/editor/actions";
import { getShape, getTool, getTools, localize } from "@/lib/registry";
import { DEFAULT_STYLE, editorStore, type StyleDefaults } from "@/lib/stores/editor";
import { localeStore } from "@/lib/stores/locale";
import {
    getPanelSelection,
    getServerPanelSelection,
    panelStore,
    setPanelOpen,
    subscribePanelSelection,
    togglePanel,
} from "@/lib/stores/panel";
import { cn } from "@/lib/utils";
import type { ShapeDefinition, ToolDefinition } from "@/types/plugin";
import type { WispenElement } from "@/types/scene";

const PANEL_ID = "properties-panel";

const PANEL_LEFT = 12;

const PANEL_WIDTH = 252;

const PANEL_GAP = 10;

const DEFAULT_TOP = 68;

const STYLE_KEYS = Object.keys(DEFAULT_STYLE) as (keyof StyleDefaults)[];

interface Item {
    shape: ShapeDefinition;
    source: Partial<WispenElement>;
    text: boolean;
}

interface PanelTarget {
    elements: WispenElement[];
    tool: ToolDefinition | null;
    items: Item[];
}

/**
 * Tells whether a shape draws an outline, which text blocks do not.
 *
 * @param shape - Shape definition read for its text mode
 * @returns true when stroke color, width and style apply
 */
function hasStroke(shape: ShapeDefinition): boolean {
    return shape.text !== "content";
}

/**
 * Reads a style property of an item, filling the line properties older documents may lack with
 * what the renderer assumes.
 *
 * @param item - Element or next-element style
 * @param key - Style property to read; arrowheads and routing fall back to the renderer default
 * @returns The stored value, or the renderer default for arrowheads and routing
 */
function read<K extends keyof StyleDefaults>(item: Item, key: K): StyleDefaults[K] | undefined {
    const value = item.source[key] as StyleDefaults[K] | undefined;
    if (value !== undefined) return value;
    if (key === "startArrowhead" || key === "endArrowhead") return "none" as StyleDefaults[K];
    if (key === "routing") return "straight" as StyleDefaults[K];
    return undefined;
}

/**
 * Returns the value of a style property shared by every item it applies to.
 *
 * @param items - Selected elements, or the single next-element style of the active tool
 * @param key - Style property compared across the items
 * @param applies - Keeps the items whose shape uses the property
 * @returns The common value, or undefined when the items differ or none uses the property
 */
function common<K extends keyof StyleDefaults>(
    items: Item[],
    key: K,
    applies: (item: Item) => boolean = () => true,
): StyleDefaults[K] | undefined {
    const relevant = items.filter(applies);
    if (relevant.length === 0) return undefined;
    const first = read(relevant[0], key);
    return relevant.every((item) => read(item, key) === first) ? first : undefined;
}

/**
 * Finds the toolbar icon of a shape type, so the panel header matches the dock.
 *
 * @param type - Element type, matched against the shape each registered tool draws
 * @returns The icon of the tool drawing that shape, or a square for shapes without a tool
 */
function shapeIcon(type: string): ToolDefinition["icon"] {
    return getTools().find((tool) => tool.shape === type)?.icon ?? Square;
}

/**
 * Subscribes to what the properties panel edits: the selection, or the style of the next
 * element when a creation tool is active and nothing is selected. The selection only changes
 * identity when a property the panel shows changes, not while it is dragged or resized.
 *
 * @returns The target, or null when there is nothing to edit
 */
function usePanelTarget(): PanelTarget | null {
    const elements = useSyncExternalStore(
        subscribePanelSelection,
        getPanelSelection,
        getServerPanelSelection,
    );
    const toolId = useStore(editorStore, (state) => state.tool);
    const style = useStore(editorStore, (state) => state.style);
    const editingId = useStore(editorStore, (state) => state.editingId);

    return useMemo(() => {
        if (elements.length > 0) {
            const items = elements.map((element) => {
                const shape = getShape(element.type);
                const text =
                    shape.text === "content" ||
                    (shape.text === "label" &&
                        (element.text.trim() !== "" || element.id === editingId));
                return { shape, source: element, text };
            });
            return { elements, tool: null, items };
        }
        const tool = getTool(toolId);
        if (!tool?.shape || tool.run) return null;
        const shape = getShape(tool.shape);
        const source = { ...style, ...shape.defaults };
        return { elements, tool, items: [{ shape, source, text: shape.text === "content" }] };
    }, [elements, toolId, style, editingId]);
}

/**
 * Places the panel under the top bar: below the tool dock when the dock sits above the panel
 * column (second row on small screens), right under the top islands otherwise. Measured from
 * the dock so it follows whatever breakpoint the layout uses.
 *
 * @returns The top offset of the panel in CSS pixels
 */
function usePanelTop(): number {
    const [top, setTop] = useState(DEFAULT_TOP);

    useEffect(() => {
        const dock = document.querySelector("[data-toolbar-dock]");
        const measure = () => {
            const box = dock?.getBoundingClientRect();
            const below = box && box.left < PANEL_LEFT + PANEL_WIDTH && box.top > DEFAULT_TOP / 2;
            setTop(below ? Math.max(DEFAULT_TOP, Math.round(box.bottom + PANEL_GAP)) : DEFAULT_TOP);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (dock) observer.observe(dock);
        window.addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, []);

    return top;
}

/**
 * Hides the panel sheet of small screens. When the focus was inside the panel it moves to the
 * toggle of the top bar, since the focused control disappears with the sheet.
 */
function closeSheet(): void {
    const focused = document.activeElement;
    const inside = focused !== null && document.getElementById(PANEL_ID)?.contains(focused);
    setPanelOpen(false);
    if (inside) document.querySelector<HTMLElement>(`[aria-controls="${PANEL_ID}"]`)?.focus();
}

/**
 * Header of the panel: the shape icon, its name (or the number of elements) and a subtitle
 * giving the text of the element, the selected shapes, or "style of the next element".
 *
 * @param target - What the panel edits; its tool is set when the next element is styled
 * @returns The header row, with a close button shown on small screens only
 */
function PanelHeader({ target }: { target: PanelTarget }) {
    const t = useTranslations("properties");
    const locale = useStore(localeStore, (state) => state.locale);
    const { elements, tool } = target;

    let icon: ToolDefinition["icon"] = Square;
    let title: string;
    let subtitle: string;
    if (tool) {
        icon = tool.icon;
        title = localize(tool.label, locale);
        subtitle = t("nextShape");
    } else if (elements.length === 1) {
        const [element] = elements;
        icon = shapeIcon(element.type);
        title = localize(getShape(element.type).label, locale);
        const excerpt = element.text.trim().split("\n")[0];
        subtitle = [excerpt, t("selected", { count: 1 })].filter(Boolean).join(", ");
    } else {
        const types = [...new Set(elements.map((element) => element.type))];
        icon = types.length === 1 ? shapeIcon(types[0]) : Layers;
        title = t("elements", { count: elements.length });
        subtitle = types.map((type) => localize(getShape(type).label, locale)).join(", ");
    }

    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-sm border border-border bg-muted text-foreground"
            >
                {createElement(icon, { className: "size-4 stroke-[1.75]" })}
            </span>
            <div className="grid min-w-0 flex-1 leading-tight">
                <h2 className="truncate text-[13px] font-semibold">{title}</h2>
                <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <Tip label={t("close")}>
                <button
                    type="button"
                    aria-label={t("close")}
                    onClick={closeSheet}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden"
                >
                    <X className="size-4 stroke-[1.75]" />
                </button>
            </Tip>
        </div>
    );
}

/**
 * Opacity row: label, slider by steps of 5 and the value in tabular figures.
 *
 * @param value - Opacity shared by the edited elements, undefined when they differ
 * @param fallback - Value the slider starts from when the elements differ
 * @param disabled - Locks the slider when every selected element is locked
 * @param onChange - Called with the new opacity in percent
 * @returns The labelled slider row
 */
function OpacityField({
    value,
    fallback,
    disabled,
    onChange,
}: {
    value: number | undefined;
    fallback: number;
    disabled: boolean;
    onChange: (opacity: number) => void;
}) {
    const t = useTranslations("properties");
    const id = useId();
    const text = value === undefined ? t("mixed") : t("percent", { value });

    return (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <span id={id} className="text-[11.5px] leading-tight font-medium text-muted-foreground">
                {t("opacity")}
            </span>
            <Range
                value={value ?? fallback}
                onChange={onChange}
                min={0}
                max={100}
                step={5}
                labelledBy={id}
                valueText={text}
                disabled={disabled}
            />
            <output
                aria-hidden="true"
                className="min-w-[4ch] text-right font-num text-[11px] leading-none font-medium text-foreground tabular-nums"
            >
                {text}
            </output>
        </div>
    );
}

/**
 * Floating properties panel on the left of the canvas, shown when elements are selected or when a
 * creation tool is active (it then edits the style of the next element). Text fields of a label
 * stay once shown for a selection, and locked elements are skipped unless all of them are locked.
 *
 * @returns The panel, or nothing when there is no selection and no creation tool is active
 */
export function PropertiesPanel() {
    const t = useTranslations("properties");
    const target = usePanelTarget();
    const open = useStore(panelStore, (state) => state.open);
    const top = usePanelTop();
    const visible = target !== null;
    const selectionKey = target?.elements.map((element) => element.id).join(",") ?? "";
    const [textKey, setTextKey] = useState("");
    if (selectionKey && textKey !== selectionKey && target?.items.some((item) => item.text)) {
        setTextKey(selectionKey);
    }

    useEffect(() => {
        if (!visible) setPanelOpen(false);
    }, [visible]);

    if (!target) return null;

    const { elements, tool } = target;
    const live = target.items.filter((item) => !item.source.locked);
    const frozen = live.length === 0;
    const items = frozen ? target.items : live;
    const textKept = selectionKey !== "" && textKey === selectionKey;
    const stroke = (item: Item) => hasStroke(item.shape);
    const fill = (item: Item) => Boolean(item.shape.fill);
    const dash = (item: Item) => hasStroke(item.shape) && item.shape.kind !== "freedraw";
    const radius = (item: Item) => Boolean(item.shape.radius);
    const linear = (item: Item) => item.shape.kind === "linear";
    const text = (item: Item) => item.text || (textKept && Boolean(item.shape.text));
    const align = (item: Item) => text(item) && item.shape.kind === "box";
    const position = (item: Item) => align(item) && item.shape.text === "label";

    const values: Partial<StyleDefaults> = {
        strokeColor: common(items, "strokeColor", stroke),
        fillColor: common(items, "fillColor", fill),
        strokeWidth: common(items, "strokeWidth", stroke),
        strokeStyle: common(items, "strokeStyle", dash),
        radius: common(items, "radius", radius),
        startArrowhead: common(items, "startArrowhead", linear),
        endArrowhead: common(items, "endArrowhead", linear),
        routing: common(items, "routing", linear),
        fontFamily: common(items, "fontFamily", text),
        fontSize: common(items, "fontSize", text),
        fontWeight: common(items, "fontWeight", text),
        fontStyle: common(items, "fontStyle", text),
        textDecoration: common(items, "textDecoration", text),
        textColor: common(items, "textColor", text),
        textAlign: common(items, "textAlign", align),
        verticalAlign: common(items, "verticalAlign", position),
        opacity: common(items, "opacity"),
    };
    const sections: StyleSections = {
        stroke: items.some(stroke),
        transparentStroke:
            items.filter(stroke).every((item) => item.shape.kind === "box") ||
            values.strokeColor === TRANSPARENT,
        fill: items.some(fill),
        strokeWidth: items.some(stroke),
        strokeStyle: items.some(dash),
        radius: items.some(radius),
        linear: items.some(linear),
    };
    const hasStyle = Object.entries(sections).some(
        ([key, shown]) => key !== "transparentStroke" && shown,
    );
    const hasText = items.some(text);
    const imposed = tool ? (items[0].shape.defaults ?? {}) : {};
    const pinned = new Set(frozen ? STYLE_KEYS : STYLE_KEYS.filter((key) => key in imposed));

    return (
        <FocusGuard>
            <Island
                id={PANEL_ID}
                role="region"
                aria-label={t("label")}
                className={cn(
                    "absolute left-3 z-20 w-[252px] overflow-hidden max-md:shadow-lg",
                    !open && "max-md:hidden",
                )}
                style={{ top, "--panel-top": `${top}px` } as CSSProperties}
            >
                <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-var(--panel-top)-64px)] max-md:[&>[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-var(--panel-top)-112px)] [&>[data-slot=scroll-area-viewport]>div]:block!">
                    <div className="grid gap-2 px-3.5 pt-2.5 pb-3">
                        <PanelHeader target={target} />

                        {hasStyle && (
                            <StyleFields
                                values={values}
                                sections={sections}
                                pinned={pinned}
                                onChange={applyStyle}
                            />
                        )}

                        {hasText && (
                            <>
                                {hasStyle && <FieldSeparator />}
                                <TextFields
                                    values={values}
                                    showAlign={items.some(align)}
                                    showPosition={items.some(position)}
                                    pinned={pinned}
                                    onChange={applyStyle}
                                />
                            </>
                        )}

                        <OpacityField
                            value={values.opacity}
                            fallback={read(items[0], "opacity") ?? DEFAULT_STYLE.opacity}
                            disabled={frozen}
                            onChange={(opacity) => applyStyle({ opacity })}
                        />

                        {elements.length > 0 && (
                            <>
                                <FieldSeparator />
                                <ArrangeFields elements={elements} />
                            </>
                        )}
                    </div>
                </ScrollArea>
            </Island>
        </FocusGuard>
    );
}

/**
 * Button of the top bar showing or hiding the properties panel on small screens, where the
 * panel would otherwise cover the canvas. Hidden from medium screens up, disabled while there
 * is nothing to edit; the marker dot tells the panel is open.
 *
 * @returns The toggle button, rendered at every width and hidden by CSS from medium screens up
 */
export function PanelToggle() {
    const t = useTranslations("properties");
    const open = useStore(panelStore, (state) => state.open);
    const available = usePanelTarget() !== null;
    const expanded = open && available;

    return (
        <FocusGuard>
            <Tip label={expanded ? t("hide") : t("show")} side="bottom">
                <button
                    type="button"
                    aria-label={t("toggle")}
                    aria-expanded={expanded}
                    aria-controls={PANEL_ID}
                    disabled={!available}
                    onClick={togglePanel}
                    className="relative grid size-9 shrink-0 place-items-center rounded-md text-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 md:hidden"
                >
                    {expanded && <span className="toggle-dot" />}
                    <SlidersHorizontal className="size-[18px] stroke-[1.75]" />
                </button>
            </Tip>
        </FocusGuard>
    );
}
