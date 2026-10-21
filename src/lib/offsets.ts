/**
 * Measures an element in the scrolled coordinates of an ancestor. Offsets ignore ancestor
 * transforms, so the result stays exact while a panel plays its zoom-in animation, and they do
 * not change when the ancestor scrolls, so the result can position an absolutely placed child.
 *
 * @param item - Element to measure
 * @param host - Positioned ancestor the box is drawn in
 * @returns Position and size of the element, or null when the host is not an offset ancestor
 */
export function measure(
    item: HTMLElement,
    host: HTMLElement,
): { x: number; y: number; w: number; h: number } | null {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = item;
    while (node && node !== host) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
    }
    return node === host ? { x, y, w: item.offsetWidth, h: item.offsetHeight } : null;
}
