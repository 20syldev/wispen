"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { getTranslator } from "@/lib/i18n";
import { BASE_PATH } from "@/lib/path";
import { openLaunchedFiles } from "@/lib/storage/files";
import { flushAutosave } from "@/lib/storage/persistence";

interface LaunchParams {
    readonly files: readonly FileSystemHandle[];
}

interface LaunchQueue {
    setConsumer: (consumer: (params: LaunchParams) => void) => void;
}

type WaitingWorker = NonNullable<ServiceWorkerRegistration["waiting"]>;

let reloading = false;

/**
 * Activates the waiting service worker once the pending autosave is written; the page reloads
 * when the new worker takes control. When another tab already activated it, or a newer version
 * replaced it, no control change will come, so the page reloads right away.
 *
 * @param worker - Installed worker waiting for the current one to go away
 */
async function applyUpdate(worker: WaitingWorker): Promise<void> {
    reloading = true;
    await flushAutosave();
    if (worker.state === "installed") worker.postMessage("skip-waiting");
    else location.reload();
}

/**
 * Offers to reload the app on a new version, in a toast that stays until the user acts.
 *
 * @param worker - Installed worker waiting for the current one to go away
 */
function offerUpdate(worker: WaitingWorker): void {
    const t = getTranslator("pwa");
    toast(t("updateTitle"), {
        id: "pwa-update",
        description: t("updateDescription"),
        duration: Infinity,
        action: { label: t("reload"), onClick: () => void applyUpdate(worker) },
    });
}

/**
 * Offers the reload once an installing worker is ready, unless it is the first install of the
 * app, since no page runs an older version then.
 *
 * @param worker - Worker being installed; null when no install is in progress
 */
function offerWhenInstalled(worker: ServiceWorker | null): void {
    worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
            offerUpdate(worker);
        }
    });
}

/**
 * Watches a registration for new versions: one already waiting, one whose install started
 * before the page registered (the browser checks for updates on navigation), or one found later.
 *
 * @param registration - Service worker registration of the app
 * @param signal - Removes the listeners when aborted
 */
function watchUpdates(registration: ServiceWorkerRegistration, signal: AbortSignal): void {
    if (registration.waiting && navigator.serviceWorker.controller) {
        offerUpdate(registration.waiting);
    }
    offerWhenInstalled(registration.installing);
    registration.addEventListener(
        "updatefound",
        () => offerWhenInstalled(registration.installing),
        { signal },
    );
    document.addEventListener(
        "visibilitychange",
        () => {
            if (document.visibilityState === "visible")
                void registration.update().catch(() => undefined);
        },
        { signal },
    );
}

/**
 * Lists the same-origin files the page loaded before the worker controlled it.
 *
 * @returns Absolute URLs from the resource timing buffer
 */
function loadedResources(): string[] {
    return performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => url.startsWith(location.origin));
}

/**
 * Registers public/sw.js at the base path, which every localized page shares, then reloads when an
 * accepted update takes control and asks the worker to cache what is already loaded.
 *
 * @param signal - Removes the listeners when aborted
 */
async function registerWorker(signal: AbortSignal): Promise<void> {
    const url = new URL(`${BASE_PATH}/sw.js`, location.origin);
    const registration = await navigator.serviceWorker.register(url, { updateViaCache: "none" });
    if (signal.aborted) return;

    watchUpdates(registration, signal);
    navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
            if (reloading) location.reload();
        },
        { signal },
    );

    const ready = await navigator.serviceWorker.ready;
    ready.active?.postMessage({ type: "precache", urls: loadedResources() });
}

/**
 * Opens the files the installed app was launched with, when the browser supports file handling.
 */
function consumeLaunchQueue(): void {
    const { launchQueue } = window as Window & { launchQueue?: LaunchQueue };
    launchQueue?.setConsumer((params) => {
        if (params.files.length > 0) void openLaunchedFiles(params.files);
    });
}

/**
 * Offline support and file handling of the installable app. Renders nothing: it opens the files
 * the app was launched with and, in production builds only, registers the service worker and
 * offers a reload when a new version is ready.
 *
 * @returns Always null
 */
export function ServiceWorker() {
    useEffect(() => {
        consumeLaunchQueue();
        if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

        const controller = new AbortController();
        void registerWorker(controller.signal).catch(() => undefined);
        return () => controller.abort();
    }, []);

    return null;
}
