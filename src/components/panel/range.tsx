"use client";

import { Slider as SliderPrimitive } from "radix-ui";

export interface RangeProps {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step: number;
    labelledBy: string;
    valueText: string;
    disabled?: boolean;
}

/**
 * Single-thumb slider of the properties panel: an ink fill on a muted track and a raised thumb
 * ringed with ink. Built on the Radix primitive rather than the shadcn slider so the thumb,
 * which carries the slider role, can be named by the field label.
 *
 * @param value - Current value, between min and max
 * @param onChange - Called with the new value on every thumb move, a multiple of step
 * @param min - Lowest value of the track
 * @param max - Highest value of the track
 * @param step - Increment of the thumb, for the pointer and the arrow keys
 * @param labelledBy - Id of the element naming the thumb
 * @param valueText - Text read by assistive technologies in place of the raw number
 * @param disabled - Dims the slider and blocks every interaction
 * @returns The slider root holding its track, ink range and thumb
 */
export function Range({
    value,
    onChange,
    min,
    max,
    step,
    labelledBy,
    valueText,
    disabled,
}: RangeProps) {
    return (
        <SliderPrimitive.Root
            value={[value]}
            onValueChange={([next]) => onChange(next)}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="relative flex h-5 w-full touch-none items-center select-none data-disabled:opacity-45"
        >
            <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted ring-1 ring-border ring-inset">
                <SliderPrimitive.Range className="absolute h-full bg-foreground" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
                aria-labelledby={labelledBy}
                aria-valuetext={valueText}
                className="block size-4 rounded-full border-2 border-foreground bg-raised shadow-sm transition-shadow outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
        </SliderPrimitive.Root>
    );
}
