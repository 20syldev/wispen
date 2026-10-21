/**
 * Generates a short random id for documents, pages and elements.
 * Falls back to Math.random outside secure contexts, where crypto.randomUUID is missing.
 *
 * @returns A 21-character url-safe id
 */
export function createId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID().replace(/-/g, "").slice(0, 21);
    }
    return Array.from({ length: 21 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}
