import { embedFonts } from "@/lib/export/fonts";
import { svgToPng } from "@/lib/export/raster";
import { type RenderedSvg, renderSvg, type SvgOptions } from "@/lib/export/svg";
import type { ExportOptions } from "@/types/plugin";
import type { WispenElement } from "@/types/scene";

/**
 * Renders elements as a standalone SVG document, with the web fonts they use when asked.
 *
 * @param elements - Elements to draw, bottom to top
 * @param options - Background, theme and padding
 * @param withFonts - Inlines the web fonts, required whenever the SVG is drawn as an image
 * @returns The SVG markup and its size in CSS pixels
 */
export async function renderStandaloneSvg(
    elements: WispenElement[],
    options: SvgOptions,
    withFonts: boolean,
): Promise<RenderedSvg> {
    const rendered = await renderSvg(elements, options);
    if (!withFonts) return rendered;
    return { ...rendered, svg: await embedFonts(rendered.svg, elements) };
}

/**
 * Renders elements as an SVG file.
 *
 * @param elements - Elements to draw, bottom to top
 * @param options - Export options; embedFonts makes the file heavier but identical everywhere
 * @returns The SVG file
 */
export async function renderSvgFile(
    elements: WispenElement[],
    options: ExportOptions,
): Promise<Blob> {
    const { svg } = await renderStandaloneSvg(elements, options, options.embedFonts);
    return new Blob([svg], { type: "image/svg+xml" });
}

/**
 * Renders elements as a PNG image. Fonts are always inlined, since the intermediate SVG is
 * drawn as an image.
 *
 * @param elements - Elements to draw, bottom to top
 * @param options - Background, theme, padding and pixel ratio (scale)
 * @returns The PNG file
 */
export async function renderPng(
    elements: WispenElement[],
    options: SvgOptions & Pick<ExportOptions, "scale">,
): Promise<Blob> {
    const { svg, width, height } = await renderStandaloneSvg(elements, options, true);
    return svgToPng(svg, width, height, options.scale);
}
