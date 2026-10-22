import { DEFAULT_LOCALE, type Locale } from "@/types/settings";

// Same variable as next.config.ts basePath; public files are not prefixed automatically.
export const BASE_PATH = process.env.BASE_PATH ?? "";

/**
 * Builds the URL path of the page in a locale, with the base path in front.
 *
 * @param locale - Locale to serve; the default one lives at the root, the others under a prefix
 * @returns Path ending with a slash, such as "/wispen/fr/"
 */
export function localePath(locale: Locale): string {
    return locale === DEFAULT_LOCALE ? `${BASE_PATH}/` : `${BASE_PATH}/${locale}/`;
}
