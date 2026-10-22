"use client";

import { Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { ActionButton } from "@/components/panel/action";
import { Field } from "@/components/panel/field";
import { useStore } from "@/hooks/useStore";
import { editorApi } from "@/lib/editor/api";
import { getCommands, runCommand } from "@/lib/editor/commands";
import { localize } from "@/lib/registry";
import { localeStore } from "@/lib/stores/locale";
import type { WispenElement } from "@/types/scene";

const ALIGN_ROWS = [
    ["align-left", "align-center", "align-right", "distribute-horizontal"],
    ["align-top", "align-middle", "align-bottom", "distribute-vertical"],
];

const LAYER_COMMANDS = ["send-to-back", "send-backward", "bring-forward", "bring-to-front"];

export interface ArrangeFieldsProps {
    elements: WispenElement[];
}

/**
 * Arrangement fields of the properties panel: alignment, stacking order and selection actions.
 * Every button runs the matching command, so its label, shortcut and state follow the palette.
 *
 * @param elements - Selected elements, read for their locked state and group ids
 * @returns The alignment, layers and actions fields, the alignment only for two elements or more
 */
export function ArrangeFields({ elements }: ArrangeFieldsProps) {
    const t = useTranslations("properties");
    const locale = useStore(localeStore, (state) => state.locale);
    const id = useId();
    const commands = new Map(getCommands().map((command) => [command.id, command]));

    const button = (commandId: string, danger = false) => {
        const command = commands.get(commandId);
        if (!command) return null;
        return (
            <ActionButton
                key={commandId}
                label={localize(command.label, locale)}
                icon={command.icon ?? LockOpen}
                shortcuts={command.shortcuts?.slice(0, 1)}
                disabled={command.enabled ? !command.enabled(editorApi) : false}
                danger={danger}
                onClick={() => runCommand(commandId)}
            />
        );
    };

    const editable = elements.filter((el) => !el.locked);
    const allLocked = elements.every((el) => el.locked);
    const groupIds = new Set(elements.map((el) => el.groupId ?? null));
    const oneGroup = groupIds.size === 1 && !groupIds.has(null);
    const grouping = oneGroup
        ? "ungroup"
        : editable.length >= 2
          ? "group"
          : elements.some((el) => el.groupId)
            ? "ungroup"
            : null;
    const lockShortcuts = commands.get("lock")?.shortcuts;

    return (
        <>
            {elements.length >= 2 && (
                <Field label={t("align")} id={`${id}-align`}>
                    <div role="group" aria-labelledby={`${id}-align`} className="grid gap-1">
                        {ALIGN_ROWS.map((row) => (
                            <div key={row[0]} className="flex gap-1">
                                {row.map((commandId) => button(commandId))}
                            </div>
                        ))}
                    </div>
                </Field>
            )}

            <Field label={t("layers")} id={`${id}-layers`}>
                <div role="group" aria-labelledby={`${id}-layers`} className="flex gap-1">
                    {LAYER_COMMANDS.map((commandId) => button(commandId))}
                </div>
            </Field>

            <Field label={t("actions")} id={`${id}-actions`}>
                <div role="group" aria-labelledby={`${id}-actions`} className="flex gap-1">
                    {button("duplicate")}
                    {button("delete", true)}
                    <ActionButton
                        label={t("lock")}
                        icon={allLocked ? Lock : LockOpen}
                        shortcuts={lockShortcuts?.slice(0, 1)}
                        pressed={allLocked}
                        onClick={() => runCommand("lock")}
                    />
                    {grouping && button(grouping)}
                </div>
            </Field>
        </>
    );
}
