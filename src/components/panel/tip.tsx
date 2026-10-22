"use client";

import type { ReactNode } from "react";

import { KeyLabel } from "@/components/key";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortcut } from "@/lib/editor/shortcuts";

export interface TipProps {
    label: string;
    shortcuts?: string[];
    side?: "top" | "right" | "bottom" | "left";
    children: ReactNode;
}

/**
 * Tooltip of the editor chrome: the label of a control followed by its keyboard shortcuts,
 * rendered as ink key caps so the hint reads at a glance.
 *
 * @param label - Already localized text, shown before the key caps
 * @param shortcuts - Shortcut definitions such as "mod+shift+e", each shown as a group of key
 * caps
 * @param side - Side of the trigger the tooltip opens on
 * @param children - Single element used as the trigger, so it must accept a ref and pointer
 * events
 * @returns The trigger wrapped in a tooltip
 */
export function Tip({ label, shortcuts = [], side = "top", children }: TipProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={side} sideOffset={8} className="flex items-center gap-2">
                <span>{label}</span>
                {shortcuts.length > 0 && (
                    <span className="flex items-center gap-1">
                        {shortcuts.map((shortcut) => (
                            <KbdGroup key={shortcut}>
                                {formatShortcut(shortcut).map((key, index) => (
                                    <Kbd key={index} className="font-num tabular-nums">
                                        <KeyLabel label={key} />
                                    </Kbd>
                                ))}
                            </KbdGroup>
                        ))}
                    </span>
                )}
            </TooltipContent>
        </Tooltip>
    );
}
