"use client";

import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useId, useState } from "react";

import { Field } from "@/components/panel/field";
import { TextPositionPreview } from "@/components/panel/previews";
import { Segmented } from "@/components/panel/segmented";
import { Swatches } from "@/components/panel/swatches";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FONT_SIZES, type FontCategory, FONTS, getFont } from "@/data/fonts";
import { PALETTE, paletteVariable } from "@/data/palette";
import type { StyleDefaults } from "@/lib/stores/editor";
import type { TextAlign, VerticalAlign } from "@/types/scene";

const CATEGORIES: FontCategory[] = ["sans", "serif", "display", "handwriting", "mono"];

const MIN_SIZE = 8;

const MAX_SIZE = 400;

const POSITIONS: VerticalAlign[] = ["top", "middle", "bottom"];

export interface TextFieldsProps {
    values: Partial<StyleDefaults>;
    showAlign: boolean;
    showPosition: boolean;
    pinned: ReadonlySet<keyof StyleDefaults>;
    onChange: (patch: Partial<StyleDefaults>) => void;
}

/**
 * Builds the CSS font stack previewing a catalog font.
 *
 * @param id - Font id from the catalog
 * @returns The custom property of the font with its generic fallback
 */
function fontStack(id: string): string {
    const font = getFont(id);
    return `var(${font.variable}), ${font.fallback}`;
}

/**
 * Parses a font size typed by the user.
 *
 * @param text - Raw field content
 * @returns The size clamped to the supported range, or null when the text is not a number
 */
function parseSize(text: string): number | null {
    const size = Number.parseFloat(text.replace(",", "."));
    if (!Number.isFinite(size)) return null;
    return Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, size)));
}

/**
 * Small numeric field for a custom font size: typing applies on Enter or when leaving the
 * field, the arrow keys step by 1 (10 with Shift) and apply right away.
 *
 * @param value - Current size, undefined when the selection mixes sizes
 * @param label - Accessible name of the field
 * @param disabled - Locks the field when the size is imposed by the shape
 * @param onCommit - Called with the new size in scene pixels
 * @returns The numeric field, empty when the sizes differ
 */
function SizeInput({
    value,
    label,
    disabled,
    onCommit,
}: {
    value: number | undefined;
    label: string;
    disabled: boolean;
    onCommit: (size: number) => void;
}) {
    const shown = value === undefined ? "" : String(value);
    const [draft, setDraft] = useState(shown);
    const [synced, setSynced] = useState(shown);
    if (synced !== shown) {
        setSynced(shown);
        setDraft(shown);
    }

    const commit = () => {
        const size = parseSize(draft);
        if (size === null || size === value) setDraft(shown);
        else onCommit(size);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commit();
            return;
        }
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
        const size = parseSize(String((parseSize(draft) ?? value ?? 20) + step));
        if (size !== null) onCommit(size);
    };

    return (
        <Input
            value={draft}
            inputMode="numeric"
            aria-label={label}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            className="h-[33px] w-[52px] shrink-0 rounded-md bg-card px-1 text-center font-num text-[13px] tabular-nums shadow-xs md:text-[13px] dark:bg-card"
        />
    );
}

/**
 * Text fields of the properties panel: font (each entry previewed in its own typeface, grouped
 * by category), size presets with a custom size, bold, italic and underline, alignment, the
 * vertical position of box labels, and the text color.
 *
 * @param values - Text style shared by the edited elements, a property being undefined when they differ
 * @param showAlign - Shows the horizontal alignment group, for shapes whose text sits in a box
 * @param showPosition - Shows the vertical position field, for box shapes carrying a label
 * @param pinned - Style keys imposed by the tool or locked, whose controls are disabled
 * @param onChange - Called with the partial style to apply to the edited elements
 * @returns The text fields, alignment and position only when they apply
 */
export function TextFields({ values, showAlign, showPosition, pinned, onChange }: TextFieldsProps) {
    const t = useTranslations("properties");
    const id = useId();

    const preset = FONT_SIZES.find((size) => size.value === values.fontSize);
    const styles = [
        values.fontWeight === "bold" && "bold",
        values.fontStyle === "italic" && "italic",
        values.textDecoration === "underline" && "underline",
    ].filter((entry): entry is string => Boolean(entry));

    const onStyles = (next: string[]) => {
        const patch: Partial<StyleDefaults> = {};
        const bold = next.includes("bold");
        const italic = next.includes("italic");
        const underline = next.includes("underline");
        if (bold !== (values.fontWeight === "bold")) patch.fontWeight = bold ? "bold" : "normal";
        if (italic !== (values.fontStyle === "italic"))
            patch.fontStyle = italic ? "italic" : "normal";
        if (underline !== (values.textDecoration === "underline"))
            patch.textDecoration = underline ? "underline" : "none";
        if (Object.keys(patch).length > 0) onChange(patch);
    };

    return (
        <>
            <Field label={t("font")} id={`${id}-font`}>
                <Select
                    value={values.fontFamily ?? ""}
                    onValueChange={(fontFamily) => onChange({ fontFamily })}
                    disabled={pinned.has("fontFamily")}
                >
                    <SelectTrigger
                        aria-labelledby={`${id}-font`}
                        className="w-full rounded-md bg-card pr-2 pl-2.5 text-sm shadow-xs hover:border-foreground/25 data-[size=default]:h-[34px] dark:bg-card dark:hover:bg-card"
                    >
                        <SelectValue placeholder={t("fontPlaceholder")}>
                            {values.fontFamily && (
                                <span
                                    className="truncate text-[15px]"
                                    style={{ fontFamily: fontStack(values.fontFamily) }}
                                >
                                    {getFont(values.fontFamily).label}
                                </span>
                            )}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                        position="popper"
                        side="bottom"
                        align="start"
                        sideOffset={6}
                        className="max-h-80 w-[min(var(--radix-select-trigger-width),calc(100vw-24px))] rounded-lg shadow-lg"
                    >
                        {CATEGORIES.map((category) => {
                            const fonts = FONTS.filter((font) => font.category === category);
                            if (fonts.length === 0) return null;
                            return (
                                <SelectGroup key={category}>
                                    <SelectLabel className="pt-2 text-[11px] font-medium">
                                        {t(`fontCategories.${category}`)}
                                    </SelectLabel>
                                    {fonts.map((font) => (
                                        <SelectItem
                                            key={font.id}
                                            value={font.id}
                                            className="h-9 rounded-sm text-[15px]"
                                            style={{ fontFamily: fontStack(font.id) }}
                                        >
                                            {font.label}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            );
                        })}
                    </SelectContent>
                </Select>
            </Field>

            <Field label={t("fontSize")} id={`${id}-size`}>
                <div className="flex gap-2">
                    <Segmented
                        type="single"
                        labelledBy={`${id}-size`}
                        value={preset?.id ?? ""}
                        onChange={(next) => {
                            const size = FONT_SIZES.find((entry) => entry.id === next);
                            if (size) onChange({ fontSize: size.value });
                        }}
                        disabled={pinned.has("fontSize")}
                        options={FONT_SIZES.map((size) => ({
                            value: size.id,
                            label: t(`sizes.${size.id}`, { size: size.value }),
                            content: size.id.toUpperCase(),
                        }))}
                    />
                    <SizeInput
                        value={values.fontSize}
                        label={t("customSize")}
                        disabled={pinned.has("fontSize")}
                        onCommit={(fontSize) => onChange({ fontSize })}
                    />
                </div>
            </Field>

            <Field label={t("formatting")} id={`${id}-format`}>
                <div className="flex gap-2">
                    <Segmented
                        type="multiple"
                        label={t("textStyle")}
                        value={styles}
                        onChange={onStyles}
                        disabled={
                            pinned.has("fontWeight") &&
                            pinned.has("fontStyle") &&
                            pinned.has("textDecoration")
                        }
                        options={[
                            {
                                value: "bold",
                                label: t("bold"),
                                content: <Bold />,
                                shortcuts: ["mod+b"],
                            },
                            {
                                value: "italic",
                                label: t("italic"),
                                content: <Italic />,
                                shortcuts: ["mod+i"],
                            },
                            {
                                value: "underline",
                                label: t("underline"),
                                content: <Underline />,
                                shortcuts: ["mod+u"],
                            },
                        ]}
                    />
                    {showAlign && (
                        <Segmented
                            type="single"
                            label={t("textAlign")}
                            value={values.textAlign ?? ""}
                            onChange={(next) => onChange({ textAlign: next as TextAlign })}
                            disabled={pinned.has("textAlign")}
                            options={[
                                { value: "left", label: t("alignLeft"), content: <AlignLeft /> },
                                {
                                    value: "center",
                                    label: t("alignCenter"),
                                    content: <AlignCenter />,
                                },
                                {
                                    value: "right",
                                    label: t("alignRight"),
                                    content: <AlignRight />,
                                },
                            ]}
                        />
                    )}
                </div>
            </Field>

            {showPosition && (
                <Field label={t("textPosition")} id={`${id}-position`}>
                    <Segmented
                        type="single"
                        labelledBy={`${id}-position`}
                        value={values.verticalAlign ?? ""}
                        onChange={(next) => onChange({ verticalAlign: next as VerticalAlign })}
                        disabled={pinned.has("verticalAlign")}
                        options={POSITIONS.map((position) => ({
                            value: position,
                            label: t(position),
                            content: <TextPositionPreview position={position} />,
                        }))}
                    />
                </Field>
            )}

            <Field label={t("textColor")} id={`${id}-color`}>
                <Swatches
                    value={values.textColor ?? ""}
                    options={PALETTE.map((key) => ({
                        value: key,
                        label: t(`colors.${key}`),
                        color: `var(${paletteVariable(key, "stroke")})`,
                    }))}
                    onChange={(textColor) => onChange({ textColor })}
                    labelledBy={`${id}-color`}
                    customLabel={t("customText")}
                    tone="stroke"
                    disabled={pinned.has("textColor")}
                />
            </Field>
        </>
    );
}
