import { StickyNote } from "lucide-react";

import type { WispenPlugin } from "@/types/plugin";

import { stickyShape } from "./note";

// Sticky notes: one shape and the tool drawing it, the smallest complete shape plugin.
export const stickyPlugin: WispenPlugin = {
    id: "sticky",
    name: { en: "Sticky notes", fr: "Notes adhésives" },
    description: {
        en: "Paper notes with a folded corner, for brainstorming and quick comments.",
        fr: "Notes papier au coin replié, pour les séances d'idées et les commentaires rapides.",
    },
    shapes: [stickyShape],
    tools: [
        {
            id: "sticky",
            label: { en: "Sticky note", fr: "Note adhésive" },
            icon: StickyNote,
            shortcuts: ["n"],
            shape: "sticky",
            placement: "main",
        },
    ],
};
