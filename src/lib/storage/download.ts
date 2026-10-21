/**
 * Turns a document or page name into a file name safe on every operating system.
 *
 * @param name - Free text name
 * @returns The name without reserved characters, or "wispen" when nothing is left
 */
export function safeFilename(name: string): string {
    const cleaned = name
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || "wispen";
}

/**
 * Triggers the browser download of a blob.
 *
 * @param blob - File content
 * @param filename - File name including its extension
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
