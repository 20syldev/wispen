export interface LoadedImage {
    src: string;
    width: number;
    height: number;
}

// Longest side kept for embedded pictures; larger ones are downscaled to keep documents light.
const MAX_SIDE = 2048;

/**
 * Opens the browser file picker.
 *
 * @param accept - Accepted extensions and MIME types, e.g. "image/*"
 * @param multiple - Allows selecting several files
 * @returns The chosen files, empty when the picker is cancelled
 */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;
        input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), {
            once: true,
        });
        input.addEventListener("cancel", () => resolve([]), { once: true });
        input.click();
    });
}

/**
 * Reads a blob as a data URL.
 *
 * @param blob - File or blob to read in full, whatever its size
 * @returns The data URL, rejected with the FileReader error when reading fails
 */
export function readAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Decodes an image from a URL.
 *
 * @param src - Data URL or same-origin URL
 * @returns The loaded image element; rejects with an Error when the source cannot be decoded
 */
function decode(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Unreadable image"));
        image.src = src;
    });
}

/**
 * Loads a picture file as a self-contained data URL with its natural size, downscaling pictures
 * whose longest side exceeds 2048 pixels. Vector images keep their original source.
 *
 * @param file - Image file from a picker, a drop or the clipboard
 * @returns The data URL and the displayed size in pixels
 */
export async function loadImageFile(file: Blob): Promise<LoadedImage> {
    const src = await readAsDataUrl(file);
    const image = await decode(src);
    const width = image.naturalWidth || 300;
    const height = image.naturalHeight || 200;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    if (scale === 1 || file.type === "image/svg+xml") return { src, width, height };

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    return { src: canvas.toDataURL(type, 0.9), width: canvas.width, height: canvas.height };
}
