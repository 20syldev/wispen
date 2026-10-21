/**
 * Lowercases a text and strips its accents, so a search typed without accents finds accented
 * French labels.
 *
 * @param text - Text typed by the user or displayed by the interface
 * @returns The folded text, only meant for comparisons
 */
export function foldText(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}
