import { Component, memo, type ReactNode } from "react";

import { getShape } from "@/lib/registry";
import type { RenderContext } from "@/types/plugin";
import type { WispenElement } from "@/types/scene";

export interface SceneProps {
    elements: WispenElement[];
    ctx: RenderContext;
    erasingIds?: Set<string>;
}

export interface ElementBoundaryProps {
    element: WispenElement;
    children: ReactNode;
}

/**
 * Error boundary around one element: a shape that throws while rendering is skipped instead of
 * unmounting the whole editor, which would also autosave the document in that state.
 *
 * @param element - Element whose object identity is watched: a new object clears the failed state
 * @param children - Shape rendering to guard
 */
class ElementBoundary extends Component<
    ElementBoundaryProps,
    { failed: boolean; element: WispenElement }
> {
    state = { failed: false, element: this.props.element };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    static getDerivedStateFromProps(
        props: ElementBoundaryProps,
        state: { failed: boolean; element: WispenElement },
    ) {
        return props.element === state.element ? null : { failed: false, element: props.element };
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}

/**
 * Draws one element with its shape component. Memoized on the element object, which the
 * stores replace on every change, so untouched elements skip rendering during drags.
 *
 * @param element - Element to draw; its object identity is the memoization key
 * @param ctx - Render services shared by the scene
 * @param erasing - Draws the element faded
 * @returns The element wrapped in its error boundary
 */
const ElementView = memo(function ElementView({
    element,
    ctx,
    erasing,
}: {
    element: WispenElement;
    ctx: RenderContext;
    erasing: boolean;
}) {
    const { Component } = getShape(element.type);
    const opacity = (Math.max(0, Math.min(100, element.opacity)) / 100) * (erasing ? 0.25 : 1);
    return (
        <g opacity={opacity < 1 ? opacity : undefined}>
            <ElementBoundary element={element}>
                <Component element={element} ctx={ctx} />
            </ElementBoundary>
        </g>
    );
});

/**
 * Draws a list of elements; used by the canvas and by the exporters, which pass a context with
 * concrete colors.
 *
 * @param elements - Elements to draw, in paint order
 * @param ctx - Render services handed to every shape component
 * @param erasingIds - Ids of the elements drawn faded while the eraser passes over them
 * @returns The drawn elements as a fragment
 */
export function Scene({ elements, ctx, erasingIds }: SceneProps) {
    return (
        <>
            {elements.map((element) => (
                <ElementView
                    key={element.id}
                    element={element}
                    ctx={ctx}
                    erasing={erasingIds?.has(element.id) ?? false}
                />
            ))}
        </>
    );
}
