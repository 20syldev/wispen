"use client";

import { useEffect } from "react";

import { measure } from "@/lib/offsets";

const HOST = ".overlay-pill";
const ITEM = ".overlay-item";
const DISABLED = `${ITEM}[data-disabled]:not([data-disabled="false"])`;
const WATCHED = ["data-highlighted", "data-selected", "data-state"];

// Last known pointer position in client pixels, kept to spot a pointer resting on a disabled row.
const pointer = { x: -1, y: -1 };

/**
 * Finds the row a pill host should sit behind: the highlighted row (pointer or keyboard), else
 * the selected palette row, else a submenu trigger whose submenu is open.
 *
 * @param host - Scrolling element carrying the overlay-pill utility
 * @returns The row to highlight, or null when none is
 */
function findActive(host: HTMLElement): HTMLElement | null {
    return (
        host.querySelector<HTMLElement>(`${ITEM}[data-highlighted]`) ??
        host.querySelector<HTMLElement>(`${ITEM}[data-selected="true"]`) ??
        host.querySelector<HTMLElement>(`${ITEM}[data-state="open"]`)
    );
}

/**
 * Fades the pill out where it stands.
 *
 * @param host - Pill host to hide
 */
function hide(host: HTMLElement): void {
    delete host.dataset.pill;
    delete host.dataset.pillTone;
}

/**
 * Tells whether the pointer rests on a disabled row, which takes no pointer events and so never
 * highlights, while the host still reports hover.
 *
 * @param host - Pill host to inspect
 * @returns true when the last known pointer position is inside a disabled row
 */
function overDisabled(host: HTMLElement): boolean {
    return Array.from(host.querySelectorAll<HTMLElement>(DISABLED)).some((row) => {
        const rect = row.getBoundingClientRect();
        return (
            pointer.x >= rect.left &&
            pointer.x <= rect.right &&
            pointer.y >= rect.top &&
            pointer.y <= rect.bottom
        );
    });
}

/**
 * Moves the pill of a host behind its active row. The first appearance is placed without a
 * transition, then the host turns "live" so later moves slide. Without an active row the pill
 * stays put while the pointer is over the host, for instance in the gap between two rows, and
 * fades out otherwise or when the pointer rests on a disabled row.
 *
 * @param host - Pill host to update
 */
function sync(host: HTMLElement): void {
    const active = findActive(host);
    const box = active ? measure(active, host) : null;
    if (!active || !box) {
        if (!host.matches(":hover") || overDisabled(host)) hide(host);
        return;
    }
    const { style, dataset } = host;
    style.setProperty("--pill-x", `${box.x}px`);
    style.setProperty("--pill-y", `${box.y}px`);
    style.setProperty("--pill-w", `${box.w}px`);
    style.setProperty("--pill-h", `${box.h}px`);
    style.setProperty("--pill-r", getComputedStyle(active).borderTopLeftRadius);
    if (active.dataset.variant === "destructive") dataset.pillTone = "destructive";
    else delete dataset.pillTone;
    if (!dataset.pill) {
        // Forces a reflow so the first placement is applied before the transition starts.
        void host.offsetWidth;
        dataset.pill = "live";
    }
}

/**
 * Finds the pill host containing a node.
 *
 * @param node - Event target or mutation target
 * @returns The closest pill host, or null
 */
function hostOf(node: EventTarget | Node | null): HTMLElement | null {
    return node instanceof Element ? node.closest<HTMLElement>(HOST) : null;
}

/**
 * Collects the pill hosts affected by one DOM mutation: the host of a row whose highlight
 * changed, the host of any subtree that gained or lost children, and hosts that just mounted.
 *
 * @param record - Observed mutation; its type, target and addedNodes tell which hosts changed
 * @param hosts - Set receiving the affected hosts
 */
function collect(record: MutationRecord, hosts: Set<HTMLElement>): void {
    if (record.type === "attributes") {
        if (record.target instanceof Element && record.target.matches(ITEM)) {
            const host = hostOf(record.target);
            if (host) hosts.add(host);
        }
        return;
    }
    const host = hostOf(record.target);
    if (host) hosts.add(host);
    record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(HOST)) hosts.add(node as HTMLElement);
        node.querySelectorAll<HTMLElement>(HOST).forEach((found) => hosts.add(found));
    });
}

/**
 * Drives the sliding highlight shared by every menu, select and command palette. A single
 * observer watches the highlight attributes Radix and cmdk toggle on rows, so pointer and
 * keyboard navigation move the pill with no per-component wiring: a surface only needs the
 * overlay-pill class on its scrolling container. A resize observer re-measures the pill when a
 * host changes its content box, for instance when a scrollbar appears or vanishes and the rows
 * change width. Mount it once, near the root.
 */
export function useSlidingPill(): void {
    useEffect(() => {
        const resizer = new ResizeObserver((entries) => {
            entries.forEach(({ target }) => {
                if (target instanceof HTMLElement && target.isConnected) sync(target);
            });
        });
        const refresh = (host: HTMLElement) => {
            resizer.observe(host);
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

        const onLeave = (event: PointerEvent) => {
            const host = hostOf(event.target);
            if (!host || host.contains(event.relatedTarget as Node | null)) return;
            requestAnimationFrame(() => {
                if (host.isConnected) sync(host);
            });
        };
        const onMove = (event: PointerEvent) => {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
        };
        document.addEventListener("pointerout", onLeave);
        document.addEventListener("pointermove", onMove, { capture: true, passive: true });
        document.addEventListener("pointerout", onMove, { capture: true, passive: true });

        document.querySelectorAll<HTMLElement>(HOST).forEach(refresh);

        return () => {
            observer.disconnect();
            resizer.disconnect();
            document.removeEventListener("pointerout", onLeave);
            document.removeEventListener("pointermove", onMove, { capture: true });
            document.removeEventListener("pointerout", onMove, { capture: true });
        };
    }, []);
}
