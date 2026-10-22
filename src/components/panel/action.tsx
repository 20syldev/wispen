"use client";

import type { ComponentType } from "react";

import { Tip } from "@/components/panel/tip";
import { cn } from "@/lib/utils";

export interface ActionButtonProps {
    label: string;
    icon: ComponentType<{ className?: string }>;
    onClick: () => void;
    shortcuts?: string[];
    disabled?: boolean;
    pressed?: boolean;
    danger?: boolean;
}

/**
 * Bordered icon button of the properties panel (layers, alignment, actions), sharing the width
 * of its row with its siblings.
 *
 * @param label - Accessible name of the button and text of its tooltip
 * @param icon - Icon component, which receives the class name sizing it
 * @param onClick - Called when the button is activated
 * @param shortcuts - Shortcut definitions such as "mod+shift+e", listed after the label in the
 * tooltip
 * @param disabled - Dims the button and blocks every interaction
 * @param pressed - Toggle state exposed as aria-pressed and drawn as an ink fill; leave undefined
 * for a plain action
 * @param danger - Tints the hover state with the destructive color
 * @returns The button with its tooltip; disabled buttons show no tooltip
 */
export function ActionButton({
    label,
    icon: Icon,
    onClick,
    shortcuts,
    disabled,
    pressed,
    danger,
}: ActionButtonProps) {
    return (
        <Tip label={label} shortcuts={shortcuts}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={pressed}
                disabled={disabled}
                onClick={onClick}
                className={cn(
                    "grid h-8 min-w-0 flex-1 place-items-center rounded-md border border-border bg-card text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
                    "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background",
                    danger &&
                        "hover:border-destructive/35 hover:bg-destructive/10 hover:text-destructive",
                )}
            >
                <Icon className="size-4 stroke-[1.75]" />
            </button>
        </Tip>
    );
}
