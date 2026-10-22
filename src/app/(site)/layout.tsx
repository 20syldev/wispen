import { Shell } from "@/components/shell";
import { buildMetadata } from "@/lib/metadata";
import { DEFAULT_LOCALE } from "@/types/settings";

import "../globals.css";

export const metadata = buildMetadata(DEFAULT_LOCALE);

export { viewport } from "@/lib/metadata";

/**
 * Root layout of the default locale, served at the site root. The other locales live under the
 * sibling [locale] segment, so this one gets its own root layout.
 *
 * @param children - Page content rendered inside the shell
 * @returns The html document of the default locale
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
    return <Shell locale={DEFAULT_LOCALE}>{children}</Shell>;
}
