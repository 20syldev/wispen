"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState } from "react";

import { ColorSpectrum } from "@/components/panel/spectrum";
import { Tip } from "@/components/panel/tip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore } from "@/hooks/useStore";
import { addRecentColor, panelStore } from "@/lib/stores/panel";
import { cn } from "@/lib/utils";

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const FALLBACK_COLOR = "#000000";

const WIDE_SCREEN = "(min-width: 768px)";

export interface ColorPickerProps {
    value: string | null;
    onChange: (color: string) => void;
    label: string;
    children: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
}

/**
 * Normalizes a hexadecimal color typed by the user.
 *
 * @param input - Text with or without the leading "#", in 3 or 6 digit form
 * @returns The color as lowercase "#rrggbb", or null when the text is not a valid hex color
 */
function normalizeHex(input: string): string | null {
    const match = HEX_PATTERN.exec(input.trim());
    if (!match) return null;
    const digits = match[1].toLowerCase();
    const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
    return `#${full}`;
}

/**
 * Converts any CSS color, including a custom property reference, to "#rrggbb" by letting a
 * canvas context parse it, which accepts every syntax the browser knows.
 *
 * @param value - CSS color or "var(--name)" resolved against the root element
 * @returns The opaque hex form, or the fallback color when it cannot be parsed
 */
function toHex(value: string | null): string {
    if (!value || typeof document === "undefined") return FALLBACK_COLOR;
    const direct = normalizeHex(value);
    if (direct) return direct;
    const variable = /^var\((--[\w-]+)\)$/.exec(value.trim());
    const color = variable
        ? getComputedStyle(document.documentElement).getPropertyValue(variable[1]).trim()
        : value;
    const resolved = normalizeHex(color);
    if (resolved) return resolved;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return FALLBACK_COLOR;
    context.fillStyle = FALLBACK_COLOR;
    context.fillStyle = color;
    return normalizeHex(context.fillStyle) ?? FALLBACK_COLOR;
}

/**
 * Custom color picker: a saturation and hue spectrum with an eyedropper (no system color dialog),
 * a validated hex field next to a preview swatch, and the custom colors picked earlier in the
 * session. Every pick is applied right away; the last one is remembered as a recent color when
 * the popover closes. Leaving the hex field only applies a color the user actually changed, so
 * opening and closing the picker never turns a palette color, which follows the theme, into a
 * fixed one.
 *
 * @param value - Color currently in use: "#rrggbb", any CSS color or a "var(--name)" reference;
 * null or unparsable falls back to black as the starting point
 * @param onChange - Called with the lowercase "#rrggbb" on every pick, as it happens
 * @param label - Tooltip of the trigger, accessible name of the popover and its heading
 * @param children - Single element used as the popover trigger, so it must accept a ref
 * @param side - Preferred side of the trigger for the popover; narrow screens always use the
 * bottom
 * @returns The trigger with its tooltip, and the picker popover while it is open
 */
export function ColorPicker({
    value,
    onChange,
    label,
    children,
    side = "right",
}: ColorPickerProps) {
    const t = useTranslations("properties");
    const recent = useStore(panelStore, (state) => state.recentColors);
    const [open, setOpen] = useState(false);
    const [placement, setPlacement] = useState(side);
    const [color, setColor] = useState(FALLBACK_COLOR);
    const [draft, setDraft] = useState(FALLBACK_COLOR);
    const picked = useRef<string | null>(null);
    const hexRef = useRef<HTMLInputElement>(null);
    const id = useId();

    const pick = (next: string) => {
        setColor(next);
        setDraft(next);
        picked.current = next;
        onChange(next);
    };

    const onOpenChange = (next: boolean) => {
        if (next) {
            const start = toHex(value);
            setColor(start);
            setDraft(start);
            setPlacement(window.matchMedia(WIDE_SCREEN).matches ? side : "bottom");
        } else if (picked.current) {
            addRecentColor(picked.current);
            picked.current = null;
        }
        setOpen(next);
    };

    const commitDraft = () => {
        const hex = normalizeHex(draft);
        if (hex && hex !== color) pick(hex);
        else setDraft(color);
        return hex !== null;
    };

    const invalid = draft.trim() !== "" && normalizeHex(draft) === null;

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <Tip label={label}>
                <PopoverTrigger asChild>{children}</PopoverTrigger>
            </Tip>
            <PopoverContent
                side={placement}
                align={placement === side ? "start" : "center"}
                sideOffset={10}
                collisionPadding={12}
                aria-label={label}
                className="grid w-64 gap-3 rounded-lg p-3 shadow-lg"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    hexRef.current?.focus();
                    hexRef.current?.select();
                }}
            >
                <p className="text-[13px] leading-tight font-semibold">{label}</p>

                <ColorSpectrum value={color} onChange={pick} />

                <div className="grid gap-1.5">
                    <label
                        htmlFor={`${id}-hex`}
                        className="text-[11.5px] leading-tight font-medium text-muted-foreground"
                    >
                        {t("hexLabel")}
                    </label>
                    <div className="flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="size-8 shrink-0 rounded-md border border-foreground/15 shadow-xs"
                            style={{ backgroundColor: color }}
                        />
                        <div className="relative flex-1">
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-num text-sm text-muted-foreground"
                            >
                                #
                            </span>
                            <Input
                                ref={hexRef}
                                id={`${id}-hex`}
                                value={draft.replace(/^#/, "")}
                                maxLength={7}
                                spellCheck={false}
                                autoComplete="off"
                                aria-invalid={invalid}
                                aria-describedby={invalid ? `${id}-error` : undefined}
                                onChange={(event) => {
                                    const text = event.target.value;
                                    setDraft(text);
                                    const hex = normalizeHex(text);
                                    if (hex && text.replace(/^#/, "").length === 6) pick(hex);
                                }}
                                onBlur={commitDraft}
                                onKeyDown={(event) => {
                                    if (event.key !== "Enter") return;
                                    event.preventDefault();
                                    if (commitDraft()) onOpenChange(false);
                                }}
                                className="h-8 bg-card pl-6 font-num text-sm tracking-wide uppercase tabular-nums dark:bg-card"
                            />
                        </div>
                    </div>
                    {invalid && (
                        <p id={`${id}-error`} className="text-xs text-destructive">
                            {t("hexInvalid")}
                        </p>
                    )}
                </div>

                <div className="grid gap-1.5">
                    <p className="text-[11.5px] leading-tight font-medium text-muted-foreground">
                        {t("recentColors")}
                    </p>
                    {recent.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {recent.map((entry) => (
                                <Tip key={entry} label={entry.toUpperCase()}>
                                    <button
                                        type="button"
                                        aria-label={entry.toUpperCase()}
                                        aria-pressed={entry === color}
                                        onClick={() => pick(entry)}
                                        className={cn(
                                            "size-6 rounded-full border border-foreground/15 transition-transform outline-none hover:scale-108 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                            entry === color &&
                                                "ring-[1.5px] ring-foreground ring-offset-2 ring-offset-popover",
                                        )}
                                        style={{ backgroundColor: entry }}
                                    />
                                </Tip>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">{t("recentEmpty")}</p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
