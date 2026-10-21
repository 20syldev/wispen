export type Attributes = Record<string, string | number | undefined>;

/**
 * Tells whether a code point may appear in an XML 1.0 document.
 *
 * @param code - Unicode code point
 * @returns false for control characters other than tab and line breaks, and for U+FFFE/U+FFFF
 */
function allowed(code: number): boolean {
    if (code === 0x9 || code === 0xa || code === 0xd) return true;
    return code >= 0x20 && code !== 0xfffe && code !== 0xffff;
}

/**
 * Escapes text for an XML attribute value, dropping characters XML cannot carry. Line breaks
 * and tabs are written as character references so parsers keep them.
 *
 * @param value - Text as typed or generated, any Unicode content
 * @returns Text safe between double quotes
 */
export function escapeXml(value: string): string {
    return Array.from(value)
        .filter((char) => allowed(char.codePointAt(0) ?? 0))
        .join("")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        .replace(/\r\n|\r|\n/g, "&#10;")
        .replace(/\t/g, "&#9;");
}

/**
 * Converts plain text to the HTML label format of draw.io: special characters escaped, line
 * breaks as <br> and runs of spaces preserved. The result still needs escapeXml when written
 * in an attribute.
 *
 * @param text - Label as typed, line breaks included
 * @returns HTML markup
 */
export function htmlLabel(text: string): string {
    return text
        .split(/\r\n|\r|\n/)
        .map((line) =>
            line
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/ {2}/g, "&nbsp; "),
        )
        .join("<br>");
}

/**
 * Serializes an XML element as indented lines, skipping undefined attributes.
 *
 * @param name - Tag name, written as is so it must be a valid XML name
 * @param attributes - Attribute values, escaped here
 * @param children - Lines of the child elements, indented by two spaces under this one
 * @returns The lines of the element, self-closing when it has no children
 */
export function xmlNode(
    name: string,
    attributes: Attributes = {},
    children: string[] = [],
): string[] {
    const attrs = Object.entries(attributes)
        .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
        .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
        .join("");
    if (children.length === 0) return [`<${name}${attrs} />`];
    return [`<${name}${attrs}>`, ...children.map((line) => `  ${line}`), `</${name}>`];
}
