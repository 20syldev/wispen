"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Field } from "@/components/panel/field";
import {
    ArrowheadPreview,
    RadiusPreview,
    RoutingPreview,
    StrokeStylePreview,
    StrokeWidthPreview,
} from "@/components/panel/previews";
import { Segmented } from "@/components/panel/segmented";
import { Swatches, type SwatchOption } from "@/components/panel/swatches";
import { PALETTE, paletteVariable, PAPER, TRANSPARENT } from "@/data/palette";
import type { StyleDefaults } from "@/lib/stores/editor";
import type { Arrowhead, Routing, StrokeStyle } from "@/types/scene";

const WIDTHS = [
    { value: 1, key: "thin" },
    { value: 2, key: "medium" },
    { value: 4, key: "thick" },
] as const;

const STROKE_STYLES: StrokeStyle[] = ["solid", "dashed", "dotted"];

const RADII = [
    { value: 0, key: "none" },
    { value: 12, key: "soft" },
    { value: 24, key: "strong" },
    { value: 9999, key: "pill" },
] as const;

const ARROWHEADS: Arrowhead[] = ["none", "arrow", "triangle", "dot", "bar"];

const ROUTINGS: Routing[] = ["straight", "elbow", "curved"];

export interface StyleSections {
    stroke: boolean;
    transparentStroke: boolean;
    fill: boolean;
    strokeWidth: boolean;
    strokeStyle: boolean;
    radius: boolean;
    linear: boolean;
}

export interface StyleFieldsProps {
    values: Partial<StyleDefaults>;
    sections: StyleSections;
    pinned: ReadonlySet<keyof StyleDefaults>;
    onChange: (patch: Partial<StyleDefaults>) => void;
}

/**
 * Drawing fields of the properties panel: stroke and fill colors, stroke width and style,
 * corner radius, and for lines the arrowheads and routing. Each field is rendered only when one
 * of the edited shapes uses it.
 *
 * @param values - Style shared by the edited elements, a property being undefined when they differ
 * @param sections - Which fields to render; transparentStroke only adds the transparent stroke swatch
 * @param pinned - Style keys imposed by the tool or locked, whose controls are disabled
 * @param onChange - Called with the partial style to apply to the edited elements
 * @returns The fields that apply, or nothing when no section is enabled
 */
export function StyleFields({ values, sections, pinned, onChange }: StyleFieldsProps) {
    const t = useTranslations("properties");
    const id = useId();

    const strokeOptions: SwatchOption[] = [
        ...(sections.transparentStroke
            ? [{ value: TRANSPARENT, label: t("colors.transparent") }]
            : []),
        ...PALETTE.map((key) => ({
            value: key,
            label: t(`colors.${key}`),
            color: `var(${paletteVariable(key, "stroke")})`,
        })),
    ];
    const fillOptions: SwatchOption[] = [
        { value: TRANSPARENT, label: t("colors.transparent") },
        { value: PAPER, label: t("colors.paper"), color: `var(${paletteVariable(PAPER, "fill")})` },
        ...PALETTE.map((key) => ({
            value: key,
            label: t(`colors.${key}`),
            color: `var(${paletteVariable(key, "fill")})`,
        })),
    ];

    return (
        <>
            {sections.stroke && (
                <Field label={t("stroke")} id={`${id}-stroke`}>
                    <Swatches
                        value={values.strokeColor ?? ""}
                        options={strokeOptions}
                        onChange={(strokeColor) => onChange({ strokeColor })}
                        labelledBy={`${id}-stroke`}
                        customLabel={t("customStroke")}
                        tone="stroke"
                        disabled={pinned.has("strokeColor")}
                    />
                </Field>
            )}

            {sections.fill && (
                <Field label={t("fill")} id={`${id}-fill`}>
                    <Swatches
                        value={values.fillColor ?? ""}
                        options={fillOptions}
                        onChange={(fillColor) => onChange({ fillColor })}
                        labelledBy={`${id}-fill`}
                        customLabel={t("customFill")}
                        tone="fill"
                        disabled={pinned.has("fillColor")}
                    />
                </Field>
            )}

            {(sections.strokeWidth || sections.strokeStyle) && (
                <div className="grid grid-cols-2 gap-2.5">
                    {sections.strokeWidth && (
                        <Field label={t("strokeWidth")} id={`${id}-width`}>
                            <Segmented
                                type="single"
                                labelledBy={`${id}-width`}
                                value={values.strokeWidth ? String(values.strokeWidth) : ""}
                                onChange={(next) => onChange({ strokeWidth: Number(next) })}
                                disabled={pinned.has("strokeWidth")}
                                options={WIDTHS.map((width) => ({
                                    value: String(width.value),
                                    label: t(`widths.${width.key}`),
                                    content: <StrokeWidthPreview width={width.value} />,
                                }))}
                            />
                        </Field>
                    )}
                    {sections.strokeStyle && (
                        <Field label={t("strokeStyle")} id={`${id}-dash`}>
                            <Segmented
                                type="single"
                                labelledBy={`${id}-dash`}
                                value={values.strokeStyle ?? ""}
                                onChange={(next) => onChange({ strokeStyle: next as StrokeStyle })}
                                disabled={pinned.has("strokeStyle")}
                                options={STROKE_STYLES.map((style) => ({
                                    value: style,
                                    label: t(`strokeStyles.${style}`),
                                    content: <StrokeStylePreview style={style} />,
                                }))}
                            />
                        </Field>
                    )}
                </div>
            )}

            {sections.radius && (
                <Field label={t("radius")} id={`${id}-radius`}>
                    <Segmented
                        type="single"
                        labelledBy={`${id}-radius`}
                        value={values.radius === undefined ? "" : String(values.radius)}
                        onChange={(next) => onChange({ radius: Number(next) })}
                        disabled={pinned.has("radius")}
                        options={RADII.map((radius) => ({
                            value: String(radius.value),
                            label: t(`radii.${radius.key}`),
                            content: <RadiusPreview radius={radius.value} />,
                        }))}
                    />
                </Field>
            )}

            {sections.linear && (
                <>
                    <Field label={t("routing")} id={`${id}-routing`}>
                        <Segmented
                            type="single"
                            labelledBy={`${id}-routing`}
                            value={values.routing ?? ""}
                            onChange={(next) => onChange({ routing: next as Routing })}
                            disabled={pinned.has("routing")}
                            options={ROUTINGS.map((routing) => ({
                                value: routing,
                                label: t(`routings.${routing}`),
                                content: <RoutingPreview routing={routing} />,
                            }))}
                        />
                    </Field>
                    <Field label={t("startArrowhead")} id={`${id}-start`}>
                        <Segmented
                            type="single"
                            labelledBy={`${id}-start`}
                            value={values.startArrowhead ?? ""}
                            onChange={(next) => onChange({ startArrowhead: next as Arrowhead })}
                            disabled={pinned.has("startArrowhead")}
                            options={ARROWHEADS.map((kind) => ({
                                value: kind,
                                label: t(`arrowheads.${kind}`),
                                content: <ArrowheadPreview kind={kind} side="start" />,
                            }))}
                        />
                    </Field>
                    <Field label={t("endArrowhead")} id={`${id}-end`}>
                        <Segmented
                            type="single"
                            labelledBy={`${id}-end`}
                            value={values.endArrowhead ?? ""}
                            onChange={(next) => onChange({ endArrowhead: next as Arrowhead })}
                            disabled={pinned.has("endArrowhead")}
                            options={ARROWHEADS.map((kind) => ({
                                value: kind,
                                label: t(`arrowheads.${kind}`),
                                content: <ArrowheadPreview kind={kind} side="end" />,
                            }))}
                        />
                    </Field>
                </>
            )}
        </>
    );
}
