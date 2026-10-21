// Bridge to next-themes, whose setter only lives in React; ThemeBridge registers it at mount.
let bridge: { get: () => string | undefined; set: (theme: string) => void } | null = null;

/**
 * Registers the next-themes accessors so non-React code (commands) can switch themes.
 *
 * @param get - Returns the resolved theme ("light" or "dark")
 * @param set - Changes the theme preference ("light", "dark" or "system")
 */
export function bindTheme(get: () => string | undefined, set: (theme: string) => void): void {
    bridge = { get, set };
}

/**
 * Switches between the light and dark themes.
 */
export function toggleTheme(): void {
    if (!bridge) return;
    bridge.set(bridge.get() === "dark" ? "light" : "dark");
}
