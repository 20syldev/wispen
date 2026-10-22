import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Shell } from "@/components/shell";
import { buildMetadata } from "@/lib/metadata";
import { DEFAULT_LOCALE, type Locale, LOCALES } from "@/types/settings";

import "../globals.css";

export const dynamicParams = false;

export { viewport } from "@/lib/metadata";

/**
 * Lists the locales to prerender: every one except the default, which the root layout serves
 * unprefixed. Any other prefix falls through to the 404.
 *
 * @returns One params object per prefixed locale
 */
export function generateStaticParams() {
    return LOCALES.filter((entry) => entry.id !== DEFAULT_LOCALE).map((entry) => ({
        locale: entry.id,
    }));
}

/**
 * Tells whether a route segment is a prefixed locale.
 *
 * @param value - Segment taken from the URL
 * @returns true when it names a supported locale other than the default
 */
function isPrefixed(value: string): value is Locale {
    return value !== DEFAULT_LOCALE && LOCALES.some((entry) => entry.id === value);
}

/**
 * Localized document metadata, resolved from the locale segment.
 *
 * @param params - Route params carrying the locale segment
 * @returns Metadata for the locale's document head
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    return isPrefixed(locale) ? buildMetadata(locale) : {};
}

/**
 * Root layout of the prefixed locales, served under /fr/ and the like. Each locale renders its
 * own document so the html language stays correct without a client round trip.
 *
 * @param children - Page content rendered inside the shell
 * @param params - Route params carrying the locale segment
 * @returns The html document of the locale
 */
export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    if (!isPrefixed(locale)) notFound();
    return <Shell locale={locale}>{children}</Shell>;
}
