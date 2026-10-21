import { Cylinder, Hexagon, MessageSquare, Star, Triangle } from "lucide-react";

import type { WispenPlugin } from "@/types/plugin";

import { cylinderShape } from "./cylinder";
import { ParallelogramIcon } from "./parallelogram";
import {
    calloutShape,
    hexagonShape,
    parallelogramShape,
    starShape,
    triangleShape,
} from "./polygons";

/**
 * Extra diagram shapes, offered in the "more tools" menu without shortcuts so they never steal
 * a key from the core tools or from other plugins.
 */
export const shapesPlugin: WispenPlugin = {
    id: "shapes",
    name: { en: "Diagram shapes", fr: "Formes de diagramme" },
    description: {
        en: "Triangle, hexagon, parallelogram, database, star and speech bubble.",
        fr: "Triangle, hexagone, parallélogramme, base de données, étoile et bulle.",
    },
    shapes: [
        triangleShape,
        hexagonShape,
        parallelogramShape,
        cylinderShape,
        starShape,
        calloutShape,
    ],
    tools: [
        {
            id: "triangle",
            label: { en: "Triangle", fr: "Triangle" },
            icon: Triangle,
            shape: "triangle",
            placement: "more",
        },
        {
            id: "hexagon",
            label: { en: "Hexagon", fr: "Hexagone" },
            icon: Hexagon,
            shape: "hexagon",
            placement: "more",
        },
        {
            id: "parallelogram",
            label: { en: "Parallelogram", fr: "Parallélogramme" },
            icon: ParallelogramIcon,
            shape: "parallelogram",
            placement: "more",
        },
        {
            id: "cylinder",
            label: { en: "Database", fr: "Base de données" },
            icon: Cylinder,
            shape: "cylinder",
            placement: "more",
        },
        {
            id: "star",
            label: { en: "Star", fr: "Étoile" },
            icon: Star,
            shape: "star",
            placement: "more",
        },
        {
            id: "callout",
            label: { en: "Speech bubble", fr: "Bulle" },
            icon: MessageSquare,
            shape: "callout",
            placement: "more",
        },
    ],
};
