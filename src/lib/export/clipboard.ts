export type ClipboardFailure = "unsupported" | "denied";

/**
 * Clipboard write failure, telling apart a browser lacking the feature (or an insecure
 * context) from a write refused by the browser or the user.
 */
export class ClipboardError extends Error {
    readonly reason: ClipboardFailure;

    /**
     * Creates the error.
     *
     * @param reason - "unsupported" when the API is missing, "denied" when the write failed
     * @param message - Technical message, for the console
     * @param cause - Underlying error, if any
     */
    constructor(reason: ClipboardFailure, message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "ClipboardError";
        this.reason = reason;
    }
}

/**
 * Tells whether the browser can write rich content (images, typed blobs) to the clipboard.
 *
 * @returns true when navigator.clipboard.write and ClipboardItem are available
 */
function canWriteItems(): boolean {
    return (
        typeof navigator !== "undefined" &&
        typeof navigator.clipboard?.write === "function" &&
        typeof ClipboardItem !== "undefined"
    );
}

/**
 * Copies a PNG image to the system clipboard. The image may still be rendering: Safari only
 * accepts clipboard writes started during the user gesture, so the write starts immediately
 * and receives the image as a promise.
 *
 * @param blob - PNG image, or a promise resolving to it
 * @throws ClipboardError when images cannot be copied; a failed rendering rejects with its own
 * error instead
 */
export async function copyPng(blob: Blob | Promise<Blob>): Promise<void> {
    if (!canWriteItems()) {
        // The rendering is abandoned: keep its failure from surfacing as an unhandled rejection.
        Promise.resolve(blob).catch(() => undefined);
        throw new ClipboardError("unsupported", "This browser cannot copy images");
    }
    try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch (error) {
        // A failed rendering is the real cause: awaiting it throws its own error first.
        await blob;
        throw new ClipboardError("denied", "The image could not be copied", error);
    }
}

/**
 * Copies SVG markup to the system clipboard as plain text, which drawing and design tools
 * paste as vector content. Like copyPng, the text may still be rendering.
 *
 * @param text - SVG markup, or a promise resolving to it
 * @throws ClipboardError when text cannot be copied; a failed rendering rejects with its own
 * error instead
 */
export async function copySvg(text: string | Promise<string>): Promise<void> {
    if (canWriteItems()) {
        const blob = Promise.resolve(text).then(
            (value) => new Blob([value], { type: "text/plain" }),
        );
        try {
            await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
        } catch (error) {
            // A failed rendering is the real cause: awaiting it throws its own error first.
            await blob;
            throw new ClipboardError("denied", "The SVG could not be copied", error);
        }
        return;
    }

    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
        // The rendering is abandoned: keep its failure from surfacing as an unhandled rejection.
        Promise.resolve(text).catch(() => undefined);
        throw new ClipboardError("unsupported", "This browser cannot copy text");
    }
    const value = await text;
    try {
        await navigator.clipboard.writeText(value);
    } catch (error) {
        throw new ClipboardError("denied", "The SVG could not be copied", error);
    }
}
