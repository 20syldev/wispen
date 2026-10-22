import { localePath } from "@/lib/path";
import { createStore } from "@/lib/store";
import { DEFAULT_LOCALE, type Locale, LOCALES, STORAGE_KEYS } from "@/types/settings";

interface LocaleState {
    locale: Locale;
}

/**
 * Holds the active UI locale.
 */
export const localeStore = createStore<LocaleState>({ locale: DEFAULT_LOCALE });

/**
 * Narrows an arbitrary string to a supported locale id.
 *
 * @param value - Candidate id, such as a stored value or a browser language prefix; null and
 * undefined never match
 * @returns The matching locale id, or null if none matches
 */
function asLocale(value: string | null | undefined): Locale | null {
    return LOCALES.some((entry) => entry.id === value) ? (value as Locale) : null;
}

/**
 * Points the address bar at the page of a locale without navigating, so a reload or a shared link
 * lands on the matching prerendered page while the editor keeps its state.
 *
 * @param locale - Locale whose path replaces the current one; the query and hash are kept
 */
function syncUrl(locale: Locale): void {
    history.replaceState(
        history.state,
        "",
        `${localePath(locale)}${location.search}${location.hash}`,
    );
}

/**
 * Resolves the active locale at mount. A prefixed page such as /fr/ always wins; the root page
 * takes the persisted value, else the browser language, else the default, and moves the address
 * to the matching path. Updates the store and the document language.
 *
 * @param page - Locale of the prerendered page being shown
 */
export function hydrateLocale(page: Locale): void {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(STORAGE_KEYS.locale);
    } catch {
        stored = null;
    }
    const locale =
        page !== DEFAULT_LOCALE
            ? page
            : (asLocale(stored) ?? asLocale((navigator.language || "").slice(0, 2)) ?? page);
    localeStore.setState({ locale });
    document.documentElement.lang = locale;
    if (locale !== page) syncUrl(locale);
}

/**
 * Changes the UI locale, persists it, updates the document language and the address.
 *
 * @param locale - Locale id, written to localStorage and to document.documentElement.lang
 */
export function setLocale(locale: Locale): void {
    localeStore.setState({ locale });
    document.documentElement.lang = locale;
    syncUrl(locale);
    try {
        localStorage.setItem(STORAGE_KEYS.locale, locale);
    } catch {
        // Preference is best effort
    }
}
