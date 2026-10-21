export interface ExcalidrawBinding {
    elementId: string;
    focus: number;
    gap: number;
    fixedPoint?: [number, number] | null;
}

export interface ExcalidrawBoundElement {
    id: string;
    type: "text" | "arrow";
}

export interface ExcalidrawElement {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    strokeColor: string;
    backgroundColor: string;
    fillStyle: string;
    strokeWidth: number;
    strokeStyle: string;
    roughness: number;
    opacity: number;
    groupIds: string[];
    frameId: string | null;
    index: string | null;
    roundness: { type: number; value?: number } | null;
    seed: number;
    version: number;
    versionNonce: number;
    isDeleted: boolean;
    boundElements: ExcalidrawBoundElement[] | null;
    updated: number;
    link: string | null;
    locked: boolean;
    text?: string;
    originalText?: string;
    fontSize?: number;
    fontFamily?: number;
    textAlign?: string;
    verticalAlign?: string;
    containerId?: string | null;
    autoResize?: boolean;
    lineHeight?: number;
    points?: [number, number][];
    lastCommittedPoint?: [number, number] | null;
    startBinding?: ExcalidrawBinding | null;
    endBinding?: ExcalidrawBinding | null;
    startArrowhead?: string | null;
    endArrowhead?: string | null;
    elbowed?: boolean;
    pressures?: number[];
    simulatePressure?: boolean;
    fileId?: string | null;
    status?: string;
    scale?: [number, number];
    crop?: null;
}

export interface ExcalidrawFile {
    mimeType: string;
    id: string;
    dataURL: string;
    created: number;
    lastRetrieved?: number;
}

export interface ExcalidrawScene {
    type: "excalidraw";
    version: number;
    source: string;
    elements: ExcalidrawElement[];
    appState: {
        viewBackgroundColor: string;
        gridSize: number | null;
        gridStep?: number;
        gridModeEnabled?: boolean;
    };
    files: Record<string, ExcalidrawFile>;
}
