import type { Metadata, Viewport } from "next";

import { MESSAGES } from "@/lib/i18n";
import { BASE_PATH } from "@/lib/path";
import type { Locale } from "@/types/settings";

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#121417" },
    ],
};

/**
 * Builds the document metadata of a locale from its message catalog.
 *
 * @param locale - Locale of the page being rendered
 * @returns Title, description and app icons for the document head
 */
export function buildMetadata(locale: Locale): Metadata {
    const { appName, description } = MESSAGES[locale].common;
    return {
        title: appName,
        description,
        applicationName: appName,
        icons: { apple: `${BASE_PATH}/icons/apple-touch-icon.png` },
        appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
    };
}
