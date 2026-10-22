"use client";

import { ColorPicker } from "@/components/panel/color";
import { Tip } from "@/components/panel/tip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isPaletteKey, paletteVariable, TRANSPARENT } from "@/data/palette";
import { cn } from "@/lib/utils";

export interface SwatchOption {
    value: string;
    label: string;
    color?: string;
}

export interface SwatchesProps {
    value: string;
    options: SwatchOption[];
    onChange: (value: string) => void;
    labelledBy: string;
    customLabel: string;
    tone: "stroke" | "fill";
    disabled?: boolean;
}

const SWATCH_CLASS =
    "relative size-6 min-w-0 shrink-0 rounded-full border border-foreground/15 p-0 transition-transform hover:scale-108 hover:bg-transparent aria-checked:shadow-[0_0_0_2px_var(--card),0_0_0_3.5px_var(--foreground)] data-[state=on]:bg-transparent disabled:opacity-45";

// Same ring as the checked state of SWATCH_CLASS, applied by hand to the custom swatch button.
const SELECTED_SHADOW = "shadow-[0_0_0_2px_var(--card),0_0_0_3.5px_var(--foreground)]";

const RAINBOW =
    "bg-[conic-gradient(var(--canvas-red),var(--canvas-orange),var(--canvas-yellow),var(--canvas-green),var(--canvas-teal),var(--canvas-blue),var(--canvas-violet),var(--canvas-pink),var(--canvas-red))]";

/**
 * Returns the color the custom picker starts from.
 *
 * @param value - Stored color; empty when the selection mixes colors
 * @param tone - Palette tone used to resolve palette keys
 * @returns A palette custom property reference, the stored custom color, or null when no
 * color is in use
 */
function pickerStart(value: string, tone: "stroke" | "fill"): string | null {
    if (!value || value === TRANSPARENT) return null;
    return isPaletteKey(value) ? `var(${paletteVariable(value, tone)})` : value;
}

/**
 * Color row of the properties panel: one round swatch per palette color in a single radio
 * group (arrow keys move between them), followed by the custom swatch opening the color picker.
 * A custom color in use shows as a dot inside the custom swatch. The selected swatch is drawn
 * with a card gap and an ink ring made of box shadows, so it never fights the focus ring.
 *
 * @param value - Selected color: a palette key, the transparent value or a custom color; empty
 * when the selection mixes colors
 * @param options - Palette colors in display order; an option without a color is drawn as the
 * transparent checkerboard
 * @param onChange - Called with the option value of a palette swatch, or with the custom color
 * picked
 * @param labelledBy - Id of the element naming the radio group
 * @param customLabel - Accessible name of the custom swatch, tooltip and heading of the picker
 * @param tone - Palette tone used to resolve the selected palette key into the picker start
 * @param disabled - Disables every swatch, the custom one included
 * @returns A grid of seven swatches per row, the custom swatch last
 */
export function Swatches({
    value,
    options,
    onChange,
    labelledBy,
    customLabel,
    tone,
    disabled,
}: SwatchesProps) {
    const preset = options.some((option) => option.value === value);
    const custom = value !== "" && !preset;

    return (
        <div className="grid grid-cols-[repeat(7,24px)] justify-between gap-y-[7px] px-0.5 py-px">
            <ToggleGroup
                type="single"
                spacing={1}
                value={preset ? value : ""}
                onValueChange={(next) => {
                    if (next) onChange(next);
                }}
                disabled={disabled}
                aria-labelledby={labelledBy}
                className="contents"
            >
                {options.map((option) => (
                    <Tip key={option.value} label={option.label}>
                        <ToggleGroupItem
                            value={option.value}
                            aria-label={option.label}
                            className={cn(
                                SWATCH_CLASS,
                                !option.color &&
                                    "bg-[repeating-conic-gradient(var(--muted)_0_25%,var(--card)_0_50%)] bg-size-[8px_8px]",
                            )}
                            style={option.color ? { backgroundColor: option.color } : undefined}
                        />
                    </Tip>
                ))}
            </ToggleGroup>
            <ColorPicker value={pickerStart(value, tone)} onChange={onChange} label={customLabel}>
                <button
                    type="button"
                    disabled={disabled}
                    aria-label={custom ? `${customLabel} ${value.toUpperCase()}` : customLabel}
                    className={cn(
                        "relative size-6 shrink-0 rounded-full border border-foreground/15 transition-transform outline-none hover:scale-108 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45",
                        RAINBOW,
                        custom && SELECTED_SHADOW,
                    )}
                >
                    {custom && (
                        <span
                            className="absolute inset-[4px] rounded-full border-2 border-card"
                            style={{ backgroundColor: value }}
                        />
                    )}
                </button>
            </ColorPicker>
        </div>
    );
}
