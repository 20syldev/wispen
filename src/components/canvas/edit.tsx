"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useActivePage, useViewport } from "@/hooks/useScene";
import { useStore } from "@/hooks/useStore";
import { screenContext } from "@/lib/canvas/colors";
import { sceneToScreen } from "@/lib/canvas/geometry";
import { labelArea } from "@/lib/canvas/render";
import { computeRoute, polylineMidpoint } from "@/lib/canvas/routing";
import { layoutText, LINE_HEIGHT } from "@/lib/canvas/text";
import { editText, stopEditing } from "@/lib/editor/actions";
import { runCommand } from "@/lib/editor/commands";
import { getShape } from "@/lib/registry";
import { editorStore } from "@/lib/stores/editor";
import type { Bounds, WispenElement } from "@/types/scene";

// Letters that, with Ctrl or Cmd, run the format command of the same name in the text editor.
const TEXT_SHORTCUTS: Record<string, string> = { b: "bold", i: "italic", u: "underline" };

/**
 * Computes the area occupied by the text of an element while it is edited. Auto-sized text
 * blocks get extra room for the caret, placed so centered or right-aligned text stays where the
 * canvas draws it.
 *
 * @param element - Element being edited; its type, text, autoSize, textAlign, font size and
 *   geometry decide the area
 * @returns The text area in scene coordinates and whether lines wrap inside it
 */
function editArea(element: WispenElement): { area: Bounds; wrap: boolean } {
    const shape = getShape(element.type);
    if (shape.text === "content") {
        const wrap = element.autoSize === false;
        const layout = layoutText(element.text || " ", element, wrap ? element.width : Infinity);
        const width = wrap ? element.width : layout.width + element.fontSize;
        const extra = width - element.width;
        const shift =
            element.textAlign === "center" ? extra / 2 : element.textAlign === "right" ? extra : 0;
        return {
            area: { x: element.x - shift, y: element.y, width, height: layout.height },
            wrap,
        };
    }
    if (shape.kind === "linear") {
        const at = polylineMidpoint(computeRoute(element).samples);
        const layout = layoutText(element.text || " ", element, 240);
        const width = Math.max(layout.width, 40) + element.fontSize;
        return {
            area: {
                x: at.x - width / 2,
                y: at.y - layout.height / 2,
                width,
                height: layout.height,
            },
            wrap: true,
        };
    }
    const area = shape.textBounds?.(element) ?? labelArea(element);
    const layout = layoutText(element.text || " ", element, Math.max(area.width, 1));
    const top =
        element.verticalAlign === "top"
            ? area.y
            : element.verticalAlign === "bottom"
              ? area.y + area.height - layout.height
              : area.y + (area.height - layout.height) / 2;
    return { area: { x: area.x, y: top, width: area.width, height: layout.height }, wrap: true };
}

/**
 * In-place text editor: a transparent textarea laid exactly over the text of the edited
 * element, matching its font, size and alignment at the current zoom. Escape or a click
 * elsewhere commits; Ctrl/Cmd + Enter too. Ctrl/Cmd + B, I and U run the bold, italic and
 * underline commands mapped in TEXT_SHORTCUTS.
 *
 * @returns The textarea, or null when no element is being edited
 */
export function TextEditor() {
    const t = useTranslations("common");
    const ref = useRef<HTMLTextAreaElement>(null);
    const editingId = useStore(editorStore, (state) => state.editingId);
    const page = useActivePage();
    const viewport = useViewport();
    const element = editingId ? (page.elements.find((el) => el.id === editingId) ?? null) : null;

    useEffect(() => {
        const textarea = ref.current;
        if (!textarea) return;
        const frame = requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        });
        return () => cancelAnimationFrame(frame);
    }, [editingId]);

    if (!element) return null;

    const { area, wrap } = editArea(element);
    const topLeft = sceneToScreen(area, viewport);
    const ctx = screenContext(null);
    const zoom = viewport.zoom;

    return (
        <textarea
            ref={ref}
            aria-label={t("textEditorLabel")}
            value={element.text}
            spellCheck={false}
            wrap={wrap ? "soft" : "off"}
            rows={1}
            onChange={(event) => editText(element.id, event.target.value)}
            onBlur={() => stopEditing()}
            onKeyDown={(event) => {
                event.stopPropagation();
                const mod = event.ctrlKey || event.metaKey;
                if (event.key === "Escape" || (event.key === "Enter" && mod)) {
                    event.preventDefault();
                    stopEditing();
                    return;
                }
                const format =
                    mod && !event.altKey ? TEXT_SHORTCUTS[event.key.toLowerCase()] : undefined;
                if (format) {
                    event.preventDefault();
                    runCommand(format);
                }
            }}
            className="absolute z-10 m-0 resize-none overflow-hidden rounded-sm border-0 bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-selection/50"
            style={{
                left: topLeft.x,
                top: topLeft.y,
                width: Math.max(area.width * zoom, 4),
                height: Math.max(area.height * zoom, element.fontSize * LINE_HEIGHT * zoom),
                fontFamily: ctx.font(element.fontFamily),
                fontSize: element.fontSize * zoom,
                fontWeight: element.fontWeight,
                fontStyle: element.fontStyle,
                textDecoration: element.textDecoration,
                lineHeight: LINE_HEIGHT,
                textAlign: element.textAlign,
                color: ctx.color(element.textColor, "stroke"),
                whiteSpace: wrap ? "pre-wrap" : "pre",
                overflowWrap: "break-word",
            }}
        />
    );
}
