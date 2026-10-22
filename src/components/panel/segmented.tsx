"use client";

import type { ReactNode } from "react";

import { Tip } from "@/components/panel/tip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface SegmentedOption {
    value: string;
    label: string;
    content: ReactNode;
    shortcuts?: string[];
}

interface SegmentedBase {
    options: SegmentedOption[];
    labelledBy?: string;
    label?: string;
    disabled?: boolean;
    className?: string;
}

export interface SegmentedSingleProps extends SegmentedBase {
    type: "single";
    value: string;
    onChange: (value: string) => void;
}

export interface SegmentedMultipleProps extends SegmentedBase {
    type: "multiple";
    value: string[];
    onChange: (value: string[]) => void;
}

const ITEM_CLASS =
    "h-[27px] min-w-0 flex-1 shrink rounded-[9px] px-0 text-xs font-semibold text-muted-foreground shadow-none transition-[color,background-color,box-shadow] hover:bg-transparent hover:text-foreground focus-visible:z-10 [&_svg]:stroke-[1.75] [&_svg:not([class*='size-'])]:size-4";

const SINGLE_CLASS = "data-[state=on]:bg-transparent aria-checked:text-foreground";

const MULTIPLE_CLASS =
    "data-[state=on]:bg-raised data-[state=on]:text-foreground aria-pressed:bg-raised aria-pressed:text-foreground aria-pressed:shadow-xs aria-pressed:inset-ring aria-pressed:inset-ring-border";

/**
 * Segmented control of the properties panel: a muted track holding equal-width options, the
 * pressed one raised like a key. A single choice raises one thumb that glides to the chosen
 * option (the glide host of useGlide); several choices raise each pressed option itself. Built on
 * the toggle group, so arrow keys move between options and only one tab stop is used. The pressed
 * style keys off aria-checked and aria-pressed because the tooltip wrapping each option
 * overrides its data-state attribute, and draws its edge with an inset ring so the focus ring
 * stays visible on the pressed option.
 *
 * @param props - Single or multiple selection props, told apart by their type field: value and
 * onChange then carry one string or a list of strings; the options, the label (or the id of the
 * element labelling the group), the disabled flag and the extra class name are read from it too
 * @returns The toggle group, one tooltip per option
 */
export function Segmented(props: SegmentedSingleProps | SegmentedMultipleProps) {
    const { options, labelledBy, label, disabled, className } = props;
    const single = props.type === "single";
    const items = options.map((option) => (
        <Tip key={option.value} label={option.label} shortcuts={option.shortcuts}>
            <ToggleGroupItem
                value={option.value}
                aria-label={option.label}
                className={cn(ITEM_CLASS, single ? SINGLE_CLASS : MULTIPLE_CLASS)}
            >
                {option.content}
            </ToggleGroupItem>
        </Tip>
    ));
    const shared = {
        spacing: 0.5,
        disabled,
        "aria-labelledby": labelledBy,
        "aria-label": label,
        className: cn(
            "flex w-full min-w-0 rounded-md border border-border bg-muted p-0.5",
            single && "glide glide-raised",
            className,
        ),
    };

    if (props.type === "multiple") {
        return (
            <ToggleGroup
                type="multiple"
                value={props.value}
                onValueChange={props.onChange}
                {...shared}
            >
                {items}
            </ToggleGroup>
        );
    }
    return (
        <ToggleGroup
            type="single"
            value={props.value}
            onValueChange={(next) => {
                if (next) props.onChange(next);
            }}
            {...shared}
        >
            {items}
        </ToggleGroup>
    );
}
