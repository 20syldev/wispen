import type { jsPDF as PdfDocument } from "jspdf";

import { canvasBackground } from "@/lib/canvas/colors";
import { renderStandaloneSvg } from "@/lib/export/pipeline";
import { svgToPng } from "@/lib/export/raster";
import type { ExportInput, ExportOptions } from "@/types/plugin";
import type { WispenElement } from "@/types/scene";

// One CSS pixel in PDF points (96 pixels and 72 points per inch).
const PX_TO_PT = 0.75;

// Largest page side PDF readers accept, in points (200 inches).
const MAX_PAGE_SIDE = 14400;

// Pixel ratio of the pictures placed on the pages.
const PDF_SCALE = 2;

// Size given to empty pages, in points: A4 landscape.
const BLANK_PAGE = { width: 841.89, height: 595.28 };

interface Sheet {
    width: number;
    height: number;
    image: Uint8Array | null;
}

/**
 * Renders the elements of one page as a PNG picture sized for a PDF page.
 *
 * @param elements - Elements of the page; an empty list gives a blank A4 sheet with no picture
 * @param options - Export options, read for background, theme and padding
 * @returns The page size in points and its picture, without picture for an empty page
 */
async function renderSheet(elements: WispenElement[], options: ExportOptions): Promise<Sheet> {
    if (elements.length === 0) return { ...BLANK_PAGE, image: null };

    const { svg, width, height } = await renderStandaloneSvg(elements, options, true);
    const png = await svgToPng(svg, width, height, PDF_SCALE);
    const fit = Math.min(
        1,
        MAX_PAGE_SIDE / (width * PX_TO_PT),
        MAX_PAGE_SIDE / (height * PX_TO_PT),
    );
    return {
        width: width * PX_TO_PT * fit,
        height: height * PX_TO_PT * fit,
        image: new Uint8Array(await png.arrayBuffer()),
    };
}

/**
 * Paints a rendered page on the current page of the PDF.
 *
 * @param pdf - Document whose last page receives the content
 * @param sheet - Rendered page; empty pages only get the background
 * @param background - Background color, or null to leave the page blank
 */
function paintSheet(pdf: PdfDocument, sheet: Sheet, background: string | null): void {
    if (sheet.image) {
        pdf.addImage(sheet.image, "PNG", 0, 0, sheet.width, sheet.height, undefined, "FAST");
    } else if (background) {
        pdf.setFillColor(background);
        pdf.rect(0, 0, sheet.width, sheet.height, "F");
    }
}

/**
 * Tells how jsPDF should orient a page, since it swaps the sides of a format that does not
 * match the orientation.
 *
 * @param sheet - Rendered page, of which only width and height are read
 * @returns "landscape" when the page is wider than tall, "portrait" otherwise, squares included
 */
function orientationOf(sheet: Sheet): "landscape" | "portrait" {
    return sheet.width > sheet.height ? "landscape" : "portrait";
}

/**
 * Builds a PDF with one page per exported page, each sized to its content and holding a
 * picture of it rendered at twice the screen resolution. Empty pages give a blank A4 page.
 * jsPDF is loaded on demand so it stays out of the main bundle.
 *
 * @param input - Pages and options of the export; the document name becomes the PDF title
 * @returns The PDF file
 */
export async function renderPdf(input: ExportInput): Promise<Blob> {
    const { jsPDF } = await import("jspdf");
    const background = input.options.background ? canvasBackground(input.options.theme) : null;
    const [first, ...rest] = input.pages.length > 0 ? input.pages : [{ elements: [] }];

    const sheet = await renderSheet(first.elements, input.options);
    const pdf = new jsPDF({
        unit: "pt",
        format: [sheet.width, sheet.height],
        orientation: orientationOf(sheet),
        compress: true,
    });
    paintSheet(pdf, sheet, background);

    for (const page of rest) {
        const next = await renderSheet(page.elements, input.options);
        pdf.addPage([next.width, next.height], orientationOf(next));
        paintSheet(pdf, next, background);
    }

    pdf.setProperties({ title: input.document.name, creator: "wispen" });
    return pdf.output("blob");
}
