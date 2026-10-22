"use client";

import { useStore } from "@/hooks/useStore";
import { createStore } from "@/lib/store";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface InstallPrompt {
    canInstall: boolean;
    install: () => Promise<boolean>;
}

// Deferred install prompt, captured at module load as the event fires once, often before mount.
const installStore = createStore<{ prompt: BeforeInstallPromptEvent | null }>({ prompt: null });

/**
 * Keeps the install prompt for later instead of letting the browser show its own banner.
 *
 * @param event - beforeinstallprompt event, only fired by Chromium browsers
 */
function capturePrompt(event: Event): void {
    event.preventDefault();
    installStore.setState({ prompt: event as BeforeInstallPromptEvent });
}

/**
 * Forgets the install prompt once the app is installed, from the menu or the browser UI.
 */
function forgetPrompt(): void {
    installStore.setState({ prompt: null });
}

/**
 * Shows the deferred install prompt. A prompt can only be used once, so it is dropped first.
 *
 * @returns true when the user accepted the installation, false when dismissed or unavailable
 */
async function install(): Promise<boolean> {
    const { prompt } = installStore.getState();
    if (!prompt) return false;
    installStore.setState({ prompt: null });
    try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        return outcome === "accepted";
    } catch {
        // The browser refuses a prompt shown twice or outside a user gesture.
        return false;
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", forgetPrompt);
}

/**
 * Exposes the browser install prompt of the PWA, for an "Install the app" menu item that hides
 * itself when installation is unavailable or done.
 *
 * @returns Whether installing is possible, and the function showing the prompt
 */
export function useInstallPrompt(): InstallPrompt {
    const canInstall = useStore(installStore, (state) => state.prompt !== null);
    return { canInstall, install };
}
