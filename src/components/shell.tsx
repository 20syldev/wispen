import type { ReactNode } from "react";

import { fontVariables } from "@/app/fonts";
import { Providers } from "@/app/providers";
import { type Locale, STORAGE_KEYS } from "@/types/settings";

// Inline script applying the persisted canvas style to <html> before the first paint.
const bootScript = `(function(){try{var d=document.documentElement;var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEYS.settings)})||"{}");if(s.canvas==="tinted")d.dataset.canvas="tinted";}catch(e){}})();`;

/**
 * Document skeleton shared by every locale: font variables, theme-safe html element and client
 * providers. The boot script runs before the first paint, like next-themes does for the dark
 * class, so the page never flashes the default look; its storage key is interpolated from the
 * shared source and any failure leaves the defaults.
 *
 * @param locale - Locale of the page, set as the document language
 * @param children - Page content rendered inside the providers
 * @returns The html document skeleton
 */
export function Shell({ locale, children }: { locale: Locale; children: ReactNode }) {
    return (
        <html
            lang={locale}
            suppressHydrationWarning
            className={`${fontVariables} h-full antialiased`}
        >
            <body className="h-full overflow-hidden overscroll-none bg-canvas font-sans text-foreground">
                <script dangerouslySetInnerHTML={{ __html: bootScript }} />
                <Providers page={locale}>{children}</Providers>
            </body>
        </html>
    );
}
