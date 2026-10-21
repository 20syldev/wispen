import { localeStore } from "@/lib/stores/locale";

// Display names of modifier and named keys, kept in plain ASCII.
const KEY_LABELS: Record<string, string> = {
    shift: "Shift",
    alt: "Alt",
    delete: "Del",
    backspace: "Backspace",
    escape: "Esc",
    enter: "Enter",
    space: "Space",
    arrowup: "Up",
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right",
    pageup: "PgUp",
    pagedown: "PgDn",
};

// Key names printed on French keyboards, used when the interface is in French.
const FRENCH_KEY_LABELS: Record<string, string> = {
    shift: "Maj",
    delete: "Suppr",
    escape: "Échap",
    enter: "Entrée",
    space: "Espace",
    pageup: "Pg.Préc",
    pagedown: "Pg.Suiv",
    arrowup: "Haut",
    arrowdown: "Bas",
    arrowleft: "Gauche",
    arrowright: "Droite",
};

// US Shift symbols mapped to their base key, so "mod+shift+]" matches the "}" of Ctrl+Shift+].
const SHIFTED_SYMBOLS: Record<string, string> = {
    "}": "]",
    "{": "[",
    _: "-",
    "+": "=",
    '"': "'",
    "?": "/",
    ":": ";",
    "<": ",",
    ">": ".",
};

/**
 * Splits a shortcut definition into its modifiers and its key.
 *
 * @param shortcut - Definition such as "mod+shift+z"; a final "+" is the plus key ("mod++")
 * @returns Lowercase modifiers without empty parts, and the key
 */
function parseShortcut(shortcut: string): { modifiers: string[]; key: string } {
    const parts = shortcut.toLowerCase().split("+");
    const key = parts.pop() || "+";
    return { modifiers: parts.filter(Boolean), key };
}

/**
 * Tells whether the platform uses Cmd rather than Ctrl as the main modifier.
 *
 * @returns true on macOS and iOS
 */
export function isApple(): boolean {
    if (typeof navigator === "undefined") return false;
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/**
 * Tells whether a keyboard event matches a shortcut such as "mod+shift+z".
 * Letters and named keys require the exact Shift state. Digits match the physical key, so "1"
 * works on AZERTY where that key types "&". Symbols match the character typed, whatever Shift,
 * AltGr or Option the layout needs for it (AZERTY types "[" with AltGr), and their US Shift
 * variants ("}" for "shift+]").
 *
 * @param event - Native keydown event, read for key, code and modifier states
 * @param shortcut - Shortcut definition, "+"-separated, the key last ("mod+=" or "mod++")
 * @returns true when the event triggers the shortcut
 */
export function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
    const { modifiers, key } = parseShortcut(shortcut);
    const wantMod = modifiers.includes("mod");
    const wantShift = modifiers.includes("shift");
    const wantAlt = modifiers.includes("alt");
    const mod = isApple() ? event.metaKey : event.ctrlKey;

    if (mod !== wantMod) return false;
    if (isApple() ? event.ctrlKey : event.metaKey) return false;

    const pressed = event.key.toLowerCase();
    if (key.length === 1 && !/^[a-z0-9]$/.test(key)) {
        if (pressed === key) return (!wantShift || event.shiftKey) && (!wantAlt || event.altKey);
        return (
            wantShift &&
            event.shiftKey &&
            event.altKey === wantAlt &&
            SHIFTED_SYMBOLS[pressed] === key
        );
    }
    if (event.altKey !== wantAlt) return false;

    if (/^[0-9]$/.test(key)) {
        if (wantShift !== event.shiftKey && wantShift) return false;
        return event.code === `Digit${key}` || event.code === `Numpad${key}`;
    }
    if (/^[a-z]$/.test(key)) {
        if (event.shiftKey !== wantShift) return false;
        return pressed === key || (event.altKey && event.code === `Key${key.toUpperCase()}`);
    }
    if (event.shiftKey !== wantShift) return false;
    return pressed === key || (key === "space" && event.code === "Space");
}

/**
 * Formats a shortcut for display, with Cmd or Ctrl depending on the platform and the key names of
 * a French keyboard (Maj, Suppr, Echap) when the interface is in French.
 *
 * @param shortcut - Shortcut definition such as "mod+shift+e"
 * @returns The keys to show, e.g. ["Ctrl", "Shift", "E"]
 */
export function formatShortcut(shortcut: string): string[] {
    const { modifiers, key } = parseShortcut(shortcut);
    const labels =
        localeStore.getState().locale === "fr"
            ? { ...KEY_LABELS, ...FRENCH_KEY_LABELS }
            : KEY_LABELS;
    const keys = modifiers.map((part) =>
        part === "mod" ? (isApple() ? "Cmd" : "Ctrl") : (labels[part] ?? part),
    );
    keys.push(labels[key] ?? (key.length === 1 ? key.toUpperCase() : key));
    return keys;
}

/**
 * Tells whether keyboard events currently target a text field, where shortcuts must not fire.
 *
 * @param target - Event target or document.activeElement; null and non-HTML targets give false
 * @returns true for inputs, textareas, selects and editable content
 */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
    );
}
