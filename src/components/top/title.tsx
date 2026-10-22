"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Tip } from "@/components/panel/tip";
import { useStore } from "@/hooks/useStore";
import { documentStore, renameDocument } from "@/lib/stores/document";
import { cn } from "@/lib/utils";

/**
 * Editable name of the current document, set in the interface font and sized to its content (with
 * a character-count fallback where field-sizing is unsupported). Enter or leaving the field
 * renames the document, Escape restores the saved name; the browser tab follows the name.
 *
 * @param className - Extra classes for the input, e.g. a responsive maximum width
 * @returns The name input
 */
export function DocumentTitle({ className }: { className?: string }) {
    const t = useTranslations("menu");
    const tc = useTranslations("common");
    const name = useStore(documentStore, (state) => state.document.name);
    const [draft, setDraft] = useState<string | null>(null);
    const cancelled = useRef(false);
    const value = draft ?? name;

    useEffect(() => {
        document.title = `${name} - ${tc("appName")}`;
    }, [name, tc]);

    return (
        <Tip label={t("renameHint")}>
            <input
                type="text"
                value={value}
                size={Math.min(Math.max(value.length, 4), 32)}
                spellCheck={false}
                autoComplete="off"
                enterKeyHint="done"
                placeholder={tc("untitled")}
                aria-label={t("documentName")}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Enter") event.currentTarget.blur();
                    else if (event.key === "Escape") {
                        cancelled.current = true;
                        event.currentTarget.blur();
                    }
                }}
                onBlur={(event) => {
                    const next = event.currentTarget.value.trim();
                    if (!cancelled.current && next && next !== name) renameDocument(next);
                    cancelled.current = false;
                    setDraft(null);
                }}
                className={cn(
                    "h-[34px] max-w-[280px] min-w-12 shrink truncate rounded-md border border-transparent bg-transparent px-2 font-brand text-[16px] text-foreground transition-[border-color,box-shadow] outline-none field-sizing-content placeholder:text-muted-foreground hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
                    className,
                )}
            />
        </Tip>
    );
}
