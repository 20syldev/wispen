"use client";

import { useTranslations } from "next-intl";

import { Nib } from "@/components/nib";
import { Kbd } from "@/components/ui/kbd";

/**
 * Hint centered over an empty page: a solid pen nib, "Page vide" in the brand font and one
 * sentence pointing to a drawing tool and to the shortcuts dialog. It ignores every pointer
 * event, so drawing straight through it works.
 *
 * @returns The hint layer, covering the canvas without catching the pointer
 */
export function EmptyState() {
    const t = useTranslations("menu");

    return (
        <div className="pointer-events-none absolute inset-0 z-10 grid animate-in place-content-center justify-items-center gap-1.5 px-6 py-[120px] text-center text-muted-foreground duration-300 fade-in-0 select-none">
            <Nib variant="solid" className="mb-2 size-14 text-foreground" />
            <p className="font-brand text-[21px] leading-tight text-foreground">
                {t("emptyTitle")}
            </p>
            <p className="max-w-[36ch] text-[13px] leading-relaxed text-balance">
                {t.rich("emptyHint", {
                    key: (chunks) => (
                        <Kbd className="h-5 border border-border px-1.5 font-num text-[11px] tabular-nums">
                            {chunks}
                        </Kbd>
                    ),
                })}
            </p>
        </div>
    );
}
