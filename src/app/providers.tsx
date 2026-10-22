"use client";

import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useEffect } from "react";

import { ThemeBridge } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { MESSAGES } from "@/lib/i18n";
import { hydrateLocale, localeStore } from "@/lib/stores/locale";
import type { Locale } from "@/types/settings";

// Dates follow the user's own time zone; they are only formatted after the editor has loaded.
const TIME_ZONE =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

/**
 * Client providers: theme (next-themes), i18n (next-intl without routing, the locale lives in a
 * store seeded from the page and localStorage), tooltips and toasts.
 *
 * @param page - Locale of the prerendered page, which hydrateLocale may override on the root page
 * @param children - Application tree
 * @returns The tree wrapped in every provider
 */
export function Providers({ page, children }: { page: Locale; children: ReactNode }) {
    const locale = useStore(localeStore, (state) => state.locale);

    useEffect(() => hydrateLocale(page), [page]);

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <NextIntlClientProvider
                locale={locale}
                messages={MESSAGES[locale]}
                timeZone={TIME_ZONE}
            >
                <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
                <ThemeBridge />
                <Toaster
                    position="bottom-center"
                    offset={{ bottom: 64 }}
                    mobileOffset={{ bottom: 112 }}
                />
            </NextIntlClientProvider>
        </ThemeProvider>
    );
}
