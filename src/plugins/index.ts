import type { WispenPlugin } from "@/types/plugin";

import { corePlugin } from "./core";
import { drawioPlugin } from "./drawio";
import { excalidrawPlugin } from "./excalidraw";
import { shapesPlugin } from "./shapes";
import { stickyPlugin } from "./sticky";

/**
 * Registered plugins, in toolbar and menu order. To add one, create a folder next to this file
 * exporting a WispenPlugin and append it here (see CONTRIBUTING.md).
 */
export const plugins: WispenPlugin[] = [
    corePlugin,
    stickyPlugin,
    shapesPlugin,
    excalidrawPlugin,
    drawioPlugin,
];
