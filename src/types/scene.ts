export interface Point {
    x: number;
    y: number;
}

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type StrokeStyle = "solid" | "dashed" | "dotted";

export type Arrowhead = "none" | "arrow" | "triangle" | "dot" | "bar";

export type Routing = "straight" | "elbow" | "curved";

export type TextAlign = "left" | "center" | "right";

export type VerticalAlign = "top" | "middle" | "bottom";

export type FontWeight = "normal" | "bold";

export type FontStyle = "normal" | "italic";

export type TextDecoration = "none" | "underline" | "line-through";

export type Side = "n" | "e" | "s" | "w";

export interface Binding {
    elementId: string;
    anchor: Point | null;
    side?: Side;
}

export interface WispenElement {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    strokeColor: string;
    fillColor: string;
    strokeWidth: number;
    strokeStyle: StrokeStyle;
    opacity: number;
    radius: number;
    text: string;
    textColor: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: FontWeight;
    fontStyle: FontStyle;
    textDecoration: TextDecoration;
    textAlign: TextAlign;
    verticalAlign: VerticalAlign;
    points?: Point[];
    startBinding?: Binding | null;
    endBinding?: Binding | null;
    startArrowhead?: Arrowhead;
    endArrowhead?: Arrowhead;
    routing?: Routing;
    src?: string;
    autoSize?: boolean;
    groupId?: string | null;
    locked?: boolean;
    data?: Record<string, unknown>;
}

export interface Page {
    id: string;
    name: string;
    elements: WispenElement[];
}

export interface WispenDocument {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    pages: Page[];
    activePageId: string;
}

export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

export interface WispenFile {
    type: "wispen";
    version: 1;
    document: WispenDocument;
}

export interface WispenClipboard {
    type: "wispen/clipboard";
    elements: WispenElement[];
}
