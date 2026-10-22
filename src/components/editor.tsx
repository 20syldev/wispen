"use client";

import { useEffect, useState } from "react";

import { PageTabs } from "@/components/bottom/pages";
import { ViewControls } from "@/components/bottom/view";
import { ZoomControls } from "@/components/bottom/zoom";
import { Canvas } from "@/components/canvas/canvas";
import { CanvasMenu } from "@/components/canvas/menu";
import { DocumentsDialog } from "@/components/dialogs/documents";
import { ExportDialog } from "@/components/dialogs/export";
import { CommandPalette } from "@/components/dialogs/palette";
import { ShortcutsDialog } from "@/components/dialogs/shortcuts";
import { EmptyState } from "@/components/empty";
import { Island } from "@/components/island";
import { PanelToggle, PropertiesPanel } from "@/components/panel/properties";
import { ServiceWorker } from "@/components/pwa";
import { TopActions } from "@/components/top/actions";
import { Logo } from "@/components/top/logo";
import { MainMenu } from "@/components/top/menu";
import { DocumentTitle } from "@/components/top/title";
import { Toolbar } from "@/components/top/toolbar";
import { useGlide } from "@/hooks/useGlide";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useSlidingPill } from "@/hooks/useSlidingPill";
import { useStore } from "@/hooks/useStore";
import { bootEditor } from "@/lib/editor/boot";
import { documentStore } from "@/lib/stores/document";

/**
 * Whole editor screen: the canvas filling the viewport and the floating islands around it.
 * The islands sit in pointer-transparent grids so the canvas stays usable between them. From
 * 1120px the top row holds the brand island, the centered tool dock and the actions; below, the
 * tool dock moves to a second row. Below 768px the page tabs get their own row above the zoom
 * and view docks; above, the side docks keep their full width and the page tabs take what is
 * left, scrolling inside themselves rather than covering the docks. Nothing but the background
 * is painted until the last document is restored, to avoid a flash of an empty board.
 *
 * @returns The editor screen, or a bare canvas-colored placeholder while booting
 */
export function Editor() {
    const [ready, setReady] = useState(false);
    const empty = useStore(documentStore, ({ document }) => {
        const page = document.pages.find((p) => p.id === document.activePageId);
        return (page ?? document.pages[0]).elements.length === 0;
    });
    useShortcuts();
    useGlide();
    useSlidingPill();

    useEffect(() => {
        let cleanup: (() => void) | undefined;
        let cancelled = false;
        void bootEditor().then((stop) => {
            if (cancelled) stop();
            else {
                cleanup = stop;
                setReady(true);
            }
        });
        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, []);

    if (!ready) return <main className="h-dvh w-full bg-canvas" />;

    return (
        <main className="relative h-dvh w-full overflow-hidden bg-canvas text-foreground">
            <CanvasMenu>
                <Canvas />
            </CanvasMenu>

            {empty && <EmptyState />}

            <header className="pointer-events-none absolute inset-x-3 top-3 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 min-[1120px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="col-start-1 row-start-1 flex min-w-0 justify-start">
                    <Island className="flex max-w-full min-w-0 items-center gap-0.5 py-1 pr-1.5 pl-1">
                        <MainMenu />
                        <Logo
                            className="shrink-0 pr-0.5 pl-1.5"
                            wordmarkClassName="max-[480px]:hidden min-[1120px]:max-[1279px]:hidden"
                        />
                        <span
                            aria-hidden="true"
                            className="mx-1 h-5 w-px shrink-0 bg-border max-[480px]:hidden"
                        />
                        <DocumentTitle />
                        <PanelToggle />
                    </Island>
                </div>
                <div className="col-span-2 row-start-2 flex min-w-0 justify-center min-[1120px]:col-span-1 min-[1120px]:col-start-2 min-[1120px]:row-start-1">
                    <Toolbar />
                </div>
                <div className="col-start-2 row-start-1 flex justify-end min-[1120px]:col-start-3">
                    <TopActions />
                </div>
            </header>

            <PropertiesPanel />

            <footer className="pointer-events-none absolute inset-x-3 bottom-3 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-2 md:grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)]">
                <div className="col-start-1 row-start-2 flex min-w-0 justify-start md:row-start-1">
                    <ZoomControls />
                </div>
                <div className="col-span-2 row-start-1 flex min-w-0 justify-center md:col-span-1 md:col-start-2">
                    <PageTabs />
                </div>
                <div className="col-start-2 row-start-2 flex justify-end md:col-start-3 md:row-start-1">
                    <ViewControls />
                </div>
            </footer>

            <CommandPalette />
            <ExportDialog />
            <DocumentsDialog />
            <ShortcutsDialog />
            <ServiceWorker />
        </main>
    );
}
