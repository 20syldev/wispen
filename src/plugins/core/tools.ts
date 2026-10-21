import {
    Circle,
    Diamond,
    Eraser,
    Hand,
    ImageIcon,
    Minus,
    MousePointer2,
    MoveRight,
    Square,
    Type,
} from "lucide-react";

import { NibIcon } from "@/components/nib";
import { insertImages } from "@/lib/editor/actions";
import { pickFiles } from "@/lib/storage/images";
import type { ToolDefinition } from "@/types/plugin";

// Built-in tools in toolbar order; keys mirror excalidraw.com so muscle memory carries over.
export const coreTools: ToolDefinition[] = [
    {
        id: "select",
        label: { en: "Selection", fr: "Sélection" },
        icon: MousePointer2,
        shortcuts: ["v", "1"],
    },
    { id: "hand", label: { en: "Hand", fr: "Main" }, icon: Hand, shortcuts: ["h"] },
    {
        id: "rectangle",
        label: { en: "Rectangle", fr: "Rectangle" },
        icon: Square,
        shortcuts: ["r", "2"],
        shape: "rectangle",
    },
    {
        id: "diamond",
        label: { en: "Diamond", fr: "Losange" },
        icon: Diamond,
        shortcuts: ["d", "3"],
        shape: "diamond",
    },
    {
        id: "ellipse",
        label: { en: "Ellipse", fr: "Ellipse" },
        icon: Circle,
        shortcuts: ["o", "4"],
        shape: "ellipse",
    },
    {
        id: "arrow",
        label: { en: "Arrow", fr: "Flèche" },
        icon: MoveRight,
        shortcuts: ["a", "5"],
        shape: "arrow",
    },
    {
        id: "line",
        label: { en: "Line", fr: "Ligne" },
        icon: Minus,
        shortcuts: ["l", "6"],
        shape: "line",
    },
    {
        id: "freedraw",
        label: { en: "Pencil", fr: "Crayon" },
        icon: NibIcon,
        shortcuts: ["p", "7"],
        shape: "freedraw",
    },
    {
        id: "text",
        label: { en: "Text", fr: "Texte" },
        icon: Type,
        shortcuts: ["t", "8"],
        shape: "text",
    },
    {
        id: "image",
        label: { en: "Image", fr: "Image" },
        icon: ImageIcon,
        shortcuts: ["i", "9"],
        run: () => {
            void pickFiles("image/*", true).then((files) => insertImages(files));
        },
    },
    { id: "eraser", label: { en: "Eraser", fr: "Gomme" }, icon: Eraser, shortcuts: ["e", "0"] },
];
