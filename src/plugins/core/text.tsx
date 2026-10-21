import { TextBlock } from "@/components/canvas/text";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";

/**
 * Free text block, sized after its content unless it was given a fixed width.
 *
 * @param element - Text read for its bounds, content and autoSize flag; only an explicit false
 * makes the text wrap inside its width
 * @param ctx - Render services resolving colors and fonts
 */
function Text({ element, ctx }: ShapeProps) {
    return (
        <TextBlock element={element} ctx={ctx} area={element} wrap={element.autoSize === false} />
    );
}

export const textShape: ShapeDefinition = {
    type: "text",
    label: { en: "Text", fr: "Texte" },
    kind: "box",
    text: "content",
    defaults: { textAlign: "left", verticalAlign: "top", autoSize: true },
    Component: Text,
};
