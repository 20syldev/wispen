import { getFont } from "@/data/fonts";
import { isPaletteKey, PALETTE, paletteVariable, PAPER, TRANSPARENT } from "@/data/palette";
import { resolveFontFamily } from "@/lib/canvas/text";
import type { ColorTone, RenderContext } from "@/types/plugin";
import type { ThemeName } from "@/types/settings";

/**
 * Builds the render context used on screen: palette colors and fonts stay CSS variables, so a
 * theme switch repaints without re-rendering.
 *
 * @param editingId - Element whose text is being edited, hidden from the scene
 * @returns A context resolving palette keys to var(--canvas-*) and fonts to var(--font-*)
 */
export function screenContext(editingId: string | null): RenderContext {
    return {
        mode: "screen",
        editingId,
        color: (value: string, tone: ColorTone) => {
            if (value === TRANSPARENT) return "none";
            return isPaletteKey(value) ? `var(${paletteVariable(value, tone)})` : value;
        },
        font: (id: string) => `var(${getFont(id).variable}), ${getFont(id).fallback}`,
    };
}

/**
 * Reads the palette custom properties of a theme from a hidden probe element carrying the
 * theme class, whatever the theme of the page. Values are read eagerly because a detached
 * element no longer resolves custom properties.
 *
 * @param theme - Theme whose colors are needed
 * @returns A resolver from variable name to concrete color
 */
function themeReader(theme: ThemeName): (variable: string) => string {
    const probe = document.createElement("div");
    probe.className = theme;
    probe.hidden = true;
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const variables = [
        "--canvas",
        paletteVariable(PAPER, "fill"),
        ...PALETTE.flatMap((key) => [paletteVariable(key, "stroke"), paletteVariable(key, "fill")]),
    ];
    const values = new Map(variables.map((name) => [name, style.getPropertyValue(name).trim()]));
    probe.remove();
    return (variable: string) => values.get(variable) || "#000000";
}

/**
 * Builds the render context used for exports: every color and font is resolved to a concrete
 * value so the produced SVG stands on its own.
 *
 * @param theme - Theme whose palette is used
 * @returns A context resolving palette keys and fonts to concrete values of that theme
 */
export function exportContext(theme: ThemeName): RenderContext {
    const read = themeReader(theme);
    return {
        mode: "export",
        editingId: null,
        color: (value: string, tone: ColorTone) => {
            if (value === TRANSPARENT) return "none";
            return isPaletteKey(value) ? read(paletteVariable(value, tone)) : value;
        },
        font: (id: string) => resolveFontFamily(id),
    };
}

/**
 * Returns the canvas background color of a theme, for exports with a background.
 *
 * @param theme - Theme to read
 * @returns A concrete CSS color
 */
export function canvasBackground(theme: ThemeName): string {
    return themeReader(theme)("--canvas");
}
