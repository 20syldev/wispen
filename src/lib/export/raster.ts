// Largest canvas side browsers accept, in device pixels.
const MAX_SIDE = 16384;

// Canvas area tried first; Chromium and Firefox handle it.
const MAX_AREA = 64 * 1024 * 1024;

// Canvas area of the retry, within the limit of Safari (about 16.7 million pixels).
const SAFE_AREA = 16 * 1024 * 1024;

/**
 * Reduces a pixel ratio so the canvas stays within the side and area limits of browsers.
 *
 * @param width - Picture width in CSS pixels
 * @param height - Picture height in CSS pixels
 * @param scale - Requested pixel ratio
 * @param maxArea - Largest canvas area allowed, in pixels
 * @returns The pixel ratio to use, never above the requested one
 */
function fitScale(width: number, height: number, scale: number, maxArea: number): number {
    return Math.min(
        scale,
        MAX_SIDE / width,
        MAX_SIDE / height,
        Math.sqrt(maxArea / (width * height)),
    );
}

/**
 * Loads and decodes an image. The load event decides whether the picture is usable: Safari
 * rejects decode() for some valid SVG pictures, which still draw once loaded.
 *
 * @param url - Image URL, typically a Blob URL
 * @returns The image, ready to be drawn
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The picture could not be decoded"));
    });
    image.src = url;
    await loaded;
    await image.decode().catch(() => undefined);
    return image;
}

/**
 * Wraps canvas.toBlob in a promise.
 *
 * @param canvas - Canvas whose current pixel size is encoded as is
 * @returns The PNG file, or null when the canvas is too large to be encoded
 */
function encodePng(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Draws a decoded picture on a canvas at a pixel ratio and encodes it.
 *
 * @param image - Decoded SVG picture
 * @param width - Picture width in CSS pixels
 * @param height - Picture height in CSS pixels
 * @param scale - Pixel ratio
 * @returns The PNG file, or null when the browser refuses a canvas that large
 */
async function draw(
    image: HTMLImageElement,
    width: number,
    height: number,
    scale: number,
): Promise<Blob | null> {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.scale(canvas.width / width, canvas.height / height);
        context.drawImage(image, 0, 0, width, height);
        return await encodePng(canvas);
    } finally {
        // Safari reclaims canvas memory lazily: free it now so multi-page PDFs do not run out.
        canvas.width = 0;
        canvas.height = 0;
    }
}

/**
 * Rasterizes an SVG document to a PNG image. The SVG must be standalone: drawn as an image, it
 * cannot reach the fonts or styles of the page. Very large pictures get a lower pixel ratio
 * than requested so the browser can still allocate the canvas.
 *
 * @param svg - Standalone SVG markup
 * @param width - Picture width in CSS pixels
 * @param height - Picture height in CSS pixels
 * @param scale - Pixel ratio of the output, e.g. 2 for a picture twice as large
 * @returns The PNG file; rejects when the picture cannot be decoded or is too large for any canvas
 */
export async function svgToPng(
    svg: string,
    width: number,
    height: number,
    scale: number,
): Promise<Blob> {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
        const image = await loadImage(url);
        const blob =
            (await draw(image, w, h, fitScale(w, h, scale, MAX_AREA))) ??
            (await draw(image, w, h, fitScale(w, h, scale, SAFE_AREA)));
        if (!blob) throw new Error("The picture is too large to be rendered");
        return blob;
    } finally {
        URL.revokeObjectURL(url);
    }
}
