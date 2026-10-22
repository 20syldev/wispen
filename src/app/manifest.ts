import type { MetadataRoute } from "next";

import { MESSAGES } from "@/lib/i18n";
import { BASE_PATH } from "@/lib/path";
import { DEFAULT_LOCALE } from "@/types/settings";

export const dynamic = "force-static";

/**
 * Web app manifest of the installable app, generated at build time. Every URL carries the base
 * path so the app installs and opens .wispen files under GitHub Pages project URLs too.
 *
 * @returns The manifest served as manifest.webmanifest
 */
export default function manifest(): MetadataRoute.Manifest {
    const root = `${BASE_PATH}/`;
    return {
        id: root,
        name: "wispen",
        short_name: "wispen",
        description: MESSAGES[DEFAULT_LOCALE].common.description,
        lang: DEFAULT_LOCALE,
        dir: "ltr",
        start_url: root,
        scope: root,
        display: "standalone",
        background_color: "#faf7f3",
        theme_color: "#faf7f3",
        categories: ["productivity", "utilities"],
        icons: [
            {
                src: `${BASE_PATH}/icons/icon-192.png`,
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: `${BASE_PATH}/icons/icon-512.png`,
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: `${BASE_PATH}/icons/maskable-512.png`,
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
        file_handlers: [
            {
                action: root,
                accept: { "application/vnd.wispen+json": [".wispen"] },
            },
        ],
        launch_handler: { client_mode: "focus-existing" },
    };
}
