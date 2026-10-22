"use client";

import { useEffect } from "react";

import { measure } from "@/lib/offsets";

const HOST = ".glide";
const ITEM = "button:not(:disabled), [data-row]";
const ACTIVE = '[data-active="true"], [aria-selected="true"], [aria-checked="true"]';

// Size change in pixels up to which an item is eased instead of snapped.
const SETTLE = 2;

// Attributes whose change moves a highlight.
const WATCHED = ["data-active", "aria-selected", "aria-checked"];

// Item under the pointer, per host.
const pointed = new WeakMap<HTMLElement, HTMLElement>();

// Last measured size of each watched item, to tell how much a resize changed it.
const sizes = new WeakMap<Element, { w: number; h: number }>();

/**
 * Finds the glide host containing a node.
 *
 * @param node - Event target or mutation target
 * @returns The closest glide host, or null
 */
function hostOf(node: EventTarget | Node | null): HTMLElement | null {
    return node instanceof Element ? node.closest<HTMLElement>(HOST) : null;
}

/**
 * Finds the outermost item of a host that contains a node, so a button nested in a row selects
 * the row.
 *
 * @param node - Node inside the host
 * @param host - Glide host bounding the search
 * @returns The item holding the node, or null when the node is not inside an item
 */
function itemOf(node: Element | null, host: HTMLElement): HTMLElement | null {
    let found: HTMLElement | null = null;
    for (let el = node; el && el !== host; el = el.parentElement) {
        if (el instanceof HTMLElement && el.matches(ITEM)) found = el;
    }
    return found;
}

/**
 * Finds the item of a host that currently shows a keyboard focus ring.
 *
 * @param host - Glide host to search
 * @returns The focused item, or null
 */
function focusedItem(host: HTMLElement): HTMLElement | null {
    return itemOf(host.querySelector(":focus-visible"), host);
}

/**
 * Finds the selected item of a host: the active tool, the selected tab or the checked option.
 *
 * @param host - Glide host to search
 * @returns The selected item, or null when none is selected
 */
function activeItem(host: HTMLElement): HTMLElement | null {
    const found = host.querySelector<HTMLElement>(ACTIVE);
    return found && found.matches(ITEM) ? found : null;
}

/**
 * Writes the box of an item onto a host as the custom properties of one of its two highlights.
 *
 * @param host - Glide host receiving the properties
 * @param key - "" for the selection thumb, "h" for the hover pill
 * @param item - Item the highlight must cover
 * @returns Whether the item could be measured inside the host
 */
function place(host: HTMLElement, key: "" | "h", item: HTMLElement): boolean {
    const box = measure(item, host);
    if (!box) return false;
    const { style } = host;
    style.setProperty(`--glide-${key}x`, `${box.x}px`);
    style.setProperty(`--glide-${key}y`, `${box.y}px`);
    style.setProperty(`--glide-${key}w`, `${box.w}px`);
    style.setProperty(`--glide-${key}h`, `${box.h}px`);
    style.setProperty(`--glide-${key}r`, getComputedStyle(item).borderTopLeftRadius);
    return true;
}

/**
 * Turns a highlight on. A highlight that was off first appears in place with no transition, then
 * turns "live" so later moves slide; a snap does the same to jump after a layout change.
 *
 * @param host - Glide host to update
 * @param attribute - Dataset key of the highlight state
 * @param snap - Whether to jump to the new box instead of sliding
 */
function show(host: HTMLElement, attribute: "glide" | "glideHover", snap: boolean): void {
    if (!host.dataset[attribute] || snap) {
        host.dataset[attribute] = "ready";

        // Forces a reflow so the "ready" placement is applied before the transition starts.
        void host.offsetWidth;
    }
    host.dataset[attribute] = "live";
}

/**
 * Moves the selection thumb behind the selected item, or fades it out when nothing is selected.
 *
 * @param host - Glide host to update
 * @param snap - Whether to jump to the new box instead of sliding
 */
function syncActive(host: HTMLElement, snap: boolean): void {
    const active = activeItem(host);
    if (!active || !place(host, "", active)) {
        delete host.dataset.glide;
        return;
    }
    show(host, "glide", snap);
}

/**
 * Moves the hover pill behind the hovered item, else behind the item with a focus ring, else
 * fades it out. Over the selected item the pill stays invisible but keeps its place, so it slides
 * out of the thumb when the pointer moves on.
 *
 * @param host - Glide host to update
 * @param snap - Whether to jump to the new box instead of sliding
 */
function syncHover(host: HTMLElement, snap: boolean): void {
    const hovered = pointed.get(host);
    const item = hovered?.isConnected ? hovered : focusedItem(host);
    if (!item || !place(host, "h", item)) {
        delete host.dataset.glideHover;
        delete host.dataset.glideOn;
        return;
    }
    if (item === activeItem(host)) host.dataset.glideOn = "";
    else delete host.dataset.glideOn;
    show(host, "glideHover", snap);
}

/**
 * Recomputes both highlights of a host.
 *
 * @param host - Glide host to update
 * @param snap - Whether to jump to the new boxes instead of sliding
 */
function sync(host: HTMLElement, snap = false): void {
    syncActive(host, snap);
    syncHover(host, snap);
}

/**
 * Collects the hosts affected by one DOM mutation: the host of an item whose selection changed,
 * the host of any subtree that gained or lost children, and hosts that just mounted.
 *
 * @param record - Observed mutation; its target, type and addedNodes tell which hosts changed
 * @param hosts - Set receiving the affected hosts
 */
function collect(record: MutationRecord, hosts: Set<HTMLElement>): void {
    const host = hostOf(record.target);
    if (host) hosts.add(host);
    if (record.type !== "childList") return;
    record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(HOST)) hosts.add(node as HTMLElement);
        node.querySelectorAll<HTMLElement>(HOST).forEach((found) => hosts.add(found));
    });
}

/**
 * Starts watching the size of the items of a host, so the highlights follow a layout change.
 * The host itself is not watched: its items keep their place when it grows, and a host whose
 * items stretch with it is caught through the items.
 *
 * @param resizer - Observer notified when a watched box changes size
 * @param host - Glide host to watch
 */
function watch(resizer: ResizeObserver, host: HTMLElement): void {
    host.querySelectorAll<HTMLElement>(ITEM).forEach((item) => resizer.observe(item));
}

/**
 * Drives the sliding highlights of the docks, page tabs, segmented controls and list rows. A
 * host carries the glide class: a selection thumb glides behind its selected item (the one with
 * data-active, aria-selected or aria-checked) and a lighter pill follows the pointer or the
 * keyboard focus. One observer watches the selection attributes and the children of every host,
 * and a resize observer snaps the highlights back in place when an item changes size, so they
 * never lag behind a layout change; a change of a pixel or two, such as a tab gaining weight when
 * it becomes the selected one, is eased instead so it does not cancel the slide in progress.
 * Mount it once, near the root.
 */
export function useGlide(): void {
    useEffect(() => {
        const resizer = new ResizeObserver((entries) => {
            const snapped = new Set<HTMLElement>();
            const eased = new Set<HTMLElement>();
            entries.forEach(({ target }) => {
                const { offsetWidth: w, offsetHeight: h } = target as HTMLElement;
                const before = sizes.get(target);
                sizes.set(target, { w, h });
                const host = hostOf(target);
                if (!before || !host) return;
                const delta = Math.max(Math.abs(w - before.w), Math.abs(h - before.h));
                if (delta > SETTLE) snapped.add(host);
                else if (delta > 0) eased.add(host);
            });
            eased.forEach((host) => sync(host));
            snapped.forEach((host) => sync(host, true));
        });

        const refresh = (host: HTMLElement) => {
            watch(resizer, host);
            sync(host);
        };

        const observer = new MutationObserver((records) => {
            const hosts = new Set<HTMLElement>();
            records.forEach((record) => collect(record, hosts));
            hosts.forEach(refresh);
        });
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: WATCHED,
            childList: true,
            subtree: true,
        });

        const onOver = (event: PointerEvent) => {
            if (event.pointerType === "touch") return;
            const host = hostOf(event.target);
            const item = host ? itemOf(event.target as Element, host) : null;
            if (!host || !item) return;
            pointed.set(host, item);
            syncHover(host, false);
        };
        const onOut = (event: PointerEvent) => {
            const host = hostOf(event.target);
            if (!host || host.contains(event.relatedTarget as Node | null)) return;
            pointed.delete(host);
            syncHover(host, false);
        };
        const onFocusIn = (event: FocusEvent) => {
            const host = hostOf(event.target);
            if (!host || !(event.target as Element).matches(":focus-visible")) return;
            pointed.delete(host);
            syncHover(host, false);
        };
        const onFocusOut = (event: FocusEvent) => {
            const host = hostOf(event.target);
            if (!host) return;
            requestAnimationFrame(() => {
                if (host.isConnected) syncHover(host, false);
            });
        };
        document.addEventListener("pointerover", onOver);
        document.addEventListener("pointerout", onOut);
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);

        document.querySelectorAll<HTMLElement>(HOST).forEach(refresh);

        return () => {
            observer.disconnect();
            resizer.disconnect();
            document.removeEventListener("pointerover", onOver);
            document.removeEventListener("pointerout", onOut);
            document.removeEventListener("focusin", onFocusIn);
            document.removeEventListener("focusout", onFocusOut);
        };
    }, []);
}
