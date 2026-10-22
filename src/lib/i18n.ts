import { createTranslator } from "next-intl";

import { localeStore } from "@/lib/stores/locale";
import enCommon from "@/messages/en/common.json";
import enContext from "@/messages/en/context.json";
import enDocuments from "@/messages/en/documents.json";
import enExport from "@/messages/en/export.json";
import enMenu from "@/messages/en/menu.json";
import enPages from "@/messages/en/pages.json";
import enPalette from "@/messages/en/palette.json";
import enProperties from "@/messages/en/properties.json";
import enPwa from "@/messages/en/pwa.json";
import enShortcuts from "@/messages/en/shortcuts.json";
import enToolbar from "@/messages/en/toolbar.json";
import enZoom from "@/messages/en/zoom.json";
import frCommon from "@/messages/fr/common.json";
import frContext from "@/messages/fr/context.json";
import frDocuments from "@/messages/fr/documents.json";
import frExport from "@/messages/fr/export.json";
import frMenu from "@/messages/fr/menu.json";
import frPages from "@/messages/fr/pages.json";
import frPalette from "@/messages/fr/palette.json";
import frProperties from "@/messages/fr/properties.json";
import frPwa from "@/messages/fr/pwa.json";
import frShortcuts from "@/messages/fr/shortcuts.json";
import frToolbar from "@/messages/fr/toolbar.json";
import frZoom from "@/messages/fr/zoom.json";

// One JSON file per namespace and locale, merged here; French is the reference catalog.
const fr = {
    common: frCommon,
    context: frContext,
    documents: frDocuments,
    export: frExport,
    menu: frMenu,
    pages: frPages,
    palette: frPalette,
    properties: frProperties,
    pwa: frPwa,
    shortcuts: frShortcuts,
    toolbar: frToolbar,
    zoom: frZoom,
};

const en: typeof fr = {
    common: enCommon,
    context: enContext,
    documents: enDocuments,
    export: enExport,
    menu: enMenu,
    pages: enPages,
    palette: enPalette,
    properties: enProperties,
    pwa: enPwa,
    shortcuts: enShortcuts,
    toolbar: enToolbar,
    zoom: enZoom,
};

export const MESSAGES = { fr, en } as const;

export type Messages = typeof fr;

/**
 * Builds a translator for non-React modules (actions, commands) that cannot call the
 * useTranslations hook. Reads the active locale at call time, so it follows runtime changes.
 *
 * @param namespace - Top-level catalog namespace to scope the keys to
 * @returns A translate function for that namespace
 */
export function getTranslator<const Namespace extends keyof Messages>(namespace: Namespace) {
    const { locale } = localeStore.getState();
    return createTranslator({ locale, messages: MESSAGES[locale], namespace });
}
