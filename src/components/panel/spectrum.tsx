"use client";

import { Pipette } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, type PointerEvent, useState } from "react";

import { Tip } from "@/components/panel/tip";
import { cn } from "@/lib/utils";

interface Hsv {
    h: number;
    s: number;
    v: number;
}

interface EyeDropperApi {
    open: () => Promise<{ sRGBHex: string }>;
}

export interface ColorSpectrumProps {
    value: string;
    onChange: (color: string) => void;
}

/**
 * Clamps a number into a range.
 *
 * @param value - Number to restrict; NaN stays NaN
 * @param min - Lower bound, inclusive
 * @param max - Upper bound, inclusive; it wins when the bounds are reversed
 * @returns The value itself, or the nearest bound when it falls outside the range
 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Converts "#rrggbb" to hue, saturation and value.
 *
 * @param hex - Six-digit hex color; anything else reads as black
 * @returns Hue in degrees between 0 and 360, saturation and value as fractions between 0 and 1
 */
function hexToHsv(hex: string): Hsv {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex);
    const int = match ? parseInt(match[1], 16) : 0;
    const r = ((int >> 16) & 255) / 255;
    const g = ((int >> 8) & 255) / 255;
    const b = (int & 255) / 255;
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    let h = 0;
    if (delta > 0) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
    }
    return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

/**
 * Converts hue, saturation and value to "#rrggbb".
 *
 * @param hsv - Hue in degrees between 0 and 360, saturation and value as fractions from 0 to 1
 * @returns The lowercase hex color, always six digits
 */
function hsvToHex({ h, s, v }: Hsv): string {
    const channel = (n: number) => {
        const k = (n + h / 60) % 6;
        const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
        return Math.round(c * 255)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${channel(5)}${channel(3)}${channel(1)}`;
}

/**
 * Reads the position of a pointer inside an element, as fractions of its size.
 *
 * @param event - Pointer event whose clientX and clientY are measured against the bounding rect
 * of its currentTarget
 * @returns Horizontal and vertical fractions, each clamped between 0 and 1
 */
function pointerRatio(event: PointerEvent<HTMLElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
        x: clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        y: clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
    };
}

/**
 * Returns the EyeDropper constructor when the browser offers one.
 *
 * @returns The constructor, or null outside Chromium browsers
 */
function eyeDropper(): (new () => EyeDropperApi) | null {
    if (typeof window === "undefined" || !("EyeDropper" in window)) return null;
    return (window as unknown as { EyeDropper: new () => EyeDropperApi }).EyeDropper;
}

/**
 * Custom color spectrum replacing the system color dialog: a saturation and brightness area, a
 * hue bar and, where supported, an eyedropper picking any color on screen. Both areas follow the
 * pointer while pressed and the arrow keys (Shift for bigger steps). The hue is kept in state so
 * it survives greys and black, where the hex color alone loses it.
 *
 * @param value - Current color as "#rrggbb"; the spectrum resyncs when it differs from the last
 * color it emitted
 * @param onChange - Called with the lowercase "#rrggbb" on every pointer, key or eyedropper pick
 * @returns The saturation area, the hue bar and the optional eyedropper button
 */
export function ColorSpectrum({ value, onChange }: ColorSpectrumProps) {
    const t = useTranslations("properties");
    const [state, setState] = useState(() => ({ hex: value, hsv: hexToHsv(value) }));

    if (value !== state.hex) setState({ hex: value, hsv: hexToHsv(value) });
    const { h, s, v } = state.hsv;
    const Dropper = eyeDropper();

    const apply = (next: Hsv) => {
        const hex = hsvToHex(next);
        setState({ hex, hsv: next });
        onChange(hex);
    };

    const onAreaPointer = (event: PointerEvent<HTMLDivElement>) => {
        if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
        else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const { x, y } = pointerRatio(event);
        apply({ h, s: x, v: 1 - y });
    };

    const onHuePointer = (event: PointerEvent<HTMLDivElement>) => {
        if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
        else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        apply({ h: pointerRatio(event).x * 360, s, v });
    };

    const onAreaKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 0.1 : 0.01;
        const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
        };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        apply({ h, s: clamp(s + move[0], 0, 1), v: clamp(v + move[1], 0, 1) });
    };

    const onHueKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 10 : 1;
        const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[
            event.key
        ];
        if (delta === undefined) return;
        event.preventDefault();
        apply({ h: clamp(h + delta, 0, 360), s, v });
    };

    const thumb =
        "pointer-events-none absolute size-4 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.3)]";

    return (
        <div className="grid gap-2.5">
            <div
                role="slider"
                tabIndex={0}
                aria-label={t("spectrumLabel")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(s * 100)}
                aria-valuetext={t("spectrumValue", {
                    saturation: Math.round(s * 100),
                    brightness: Math.round(v * 100),
                })}
                onPointerDown={onAreaPointer}
                onPointerMove={onAreaPointer}
                onKeyDown={onAreaKey}
                className="relative h-36 cursor-crosshair touch-none overflow-hidden rounded-md border border-foreground/10 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                style={{ backgroundColor: `hsl(${h} 100% 50%)` }}
            >
                <div className="absolute inset-0 bg-linear-to-r from-white to-transparent" />
                <div className="absolute inset-0 bg-linear-to-t from-black to-transparent" />
                <span
                    className={thumb}
                    style={{
                        left: `${s * 100}%`,
                        top: `${(1 - v) * 100}%`,
                        backgroundColor: value,
                    }}
                />
            </div>

            <div className="flex items-center gap-2">
                <div
                    role="slider"
                    tabIndex={0}
                    aria-label={t("hueLabel")}
                    aria-valuemin={0}
                    aria-valuemax={360}
                    aria-valuenow={Math.round(h)}
                    onPointerDown={onHuePointer}
                    onPointerMove={onHuePointer}
                    onKeyDown={onHueKey}
                    className="relative h-3 flex-1 cursor-pointer touch-none rounded-full bg-[linear-gradient(to_right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                    <span
                        className={cn(thumb, "top-1/2")}
                        style={{
                            left: `${(h / 360) * 100}%`,
                            backgroundColor: `hsl(${h} 100% 50%)`,
                        }}
                    />
                </div>
                {Dropper && (
                    <Tip label={t("eyedropper")} side="top">
                        <button
                            type="button"
                            aria-label={t("eyedropper")}
                            onClick={() => {
                                void new Dropper()
                                    .open()
                                    .then((result) => {
                                        const hsv = hexToHsv(result.sRGBHex);
                                        apply(hsv);
                                    })
                                    .catch(() => undefined);
                            }}
                            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                            <Pipette className="size-4" aria-hidden="true" />
                        </button>
                    </Tip>
                )}
            </div>
        </div>
    );
}
