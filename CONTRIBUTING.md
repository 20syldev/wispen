# Contributing to wispen

Thanks for your interest! This guide explains how to run the project, the conventions to follow and
how to write a plugin. Discussions are in English; code, identifiers and comments are in English
too.

## Getting started

Requirements: Node.js 24 and npm.

```bash
npm install        # dependencies
npm run dev        # development server on http://127.0.0.1:9456
npm run check      # tsc (application and service worker), eslint, prettier --check
npm run format     # prettier --write then eslint --fix
npm run build      # icons, service worker, then static export into out/
npm start          # serves out/ on port 9457 to test the build
```

`npm run check` must pass before every commit.

The build produces a static site (`output: "export"`) deployed to GitHub Pages by
`.github/workflows/deploy.yml`. The `BASE_PATH` variable serves the application from a subfolder
(`BASE_PATH=/wispen npm run build`).

## Structure

- `src/app/`: route groups, fonts (`fonts.ts`) and `globals.css`, which imports the stylesheets of
  `appearance/` (theme tokens, base, controls, overlays, widgets, scrollbars). `(site)/` holds the
  English root layout and the single page, served at `/`; `[locale]/` holds the prefixed locales
  (`/fr/`).
- `src/components/`: one folder per editor area. `top/` (menu, logo, title, actions, toolbar),
  `bottom/` (pages, zoom, grid), `panel/` (properties, color picker and its fields), `canvas/` (SVG
  canvas, scene, text, selection, context menu), `dialogs/` (command palette, export, documents,
  shortcuts) and `ui/` (generated shadcn/ui components). `Editor`, `Island`, `Empty`, `Theme`
  and `Pwa` stay at the root, along with `shell.tsx`, the HTML skeleton shared by the layouts.
- `src/data/`: static catalogs (fonts, palette).
- `src/hooks/`: React hooks (`useStore`, `useShortcuts`, `useScene`...).
- `src/lib/`: logic without React. `canvas/` (interactions, geometry, bindings, routing, text,
  rendering), `editor/` (actions, commands, shortcuts, clipboard, `EditorApi` facade), `storage/`
  (local save, files, import, serialization), `export/` and `stores/` (document, editor, locale,
  panel). `registry.ts` exposes the plugins, `metadata.ts` builds the per-locale page metadata and
  `path.ts` maps locales to addresses.
- `src/messages/`: interface translations, one JSON file per namespace in `en/` and `fr/`.
- `src/plugins/`: `core/` (base shapes, tools and formats), the bundled plugins (`sticky`,
  `shapes`, `excalidraw`, `drawio`) and `index.ts`, which registers them.
- `src/types/`: shared types (`scene.ts`, `plugin.ts`, `settings.ts`).
- `src/worker/`: service worker of the offline PWA, compiled into `public/sw.js`.
- `scripts/`: icon generation.

## Conventions

### Code

- All application code is strict TypeScript (`.ts` for logic, `.tsx` for components); no `.js`
  outside configuration files. Alias `@/*` points to `src/*`.
- Styles: Tailwind classes with semantic tokens only (`bg-background`, `text-muted-foreground`,
  `border-border`, `bg-canvas`, `rounded-island`, `shadow-island`...). No hard-coded color, no CSS
  module, no HTML `style` element or `style` attribute, except for a value computed in JS.
  Stylesheets live in `src/app/appearance/`. Canvas shapes go through `ctx.color()` (see below).
- Components: shadcn/ui (new-york style) in `src/components/ui/`, never rewritten beyond what is
  strictly necessary; Radix primitives imported from the unified `radix-ui` package.
- Icons: `lucide-react`. Failing that, a small dedicated `.tsx` component with an SVG using
  `currentColor`, `aria-hidden="true"` and a `className` prop (see
  `src/plugins/shapes/parallelogram.tsx`).
- No decorative Unicode character in the code, comments or interface: no emoji, arrow or check
  mark, and no key glyph (`Cmd`, `Shift` spelled out). Accents in French text remain welcome.
- Accessibility: semantic HTML, `aria-label` and tooltip on icon buttons, keyboard-reachable
  controls, `focus-visible` preserved.
- Prettier: 4 spaces, double quotes, semicolons, trailing commas, 100 columns. ESLint (flat config)
  also checks import order and file naming.

### File naming

- Components: a single lowercase word, the folder giving the context (`dialogs/export.tsx`,
  `panel/color.tsx`). The exported component stays in PascalCase (`ExportDialog`).
- Hooks: camelCase prefixed with `use` (`useShortcuts.ts`).
- `lib/`, `data/`, `types/`, `plugins/`: camelCase (`serialization.ts`).
- Never kebab-case.

### Comments

Strict rules, checked in review:

1. Every function or component declared at module level, exported or not, including a `const` that
   holds a function, carries a multi-line `/** */` JSDoc block:
    - a first sentence saying what the symbol does, ending with a period;
    - if needed, one or two lines on a notable implementation detail;
    - an empty line, then a `@param name - Description` for each parameter (including each
      destructured prop of a component whose props are typed inline) and a `@returns` whenever the
      function does not return `void`;
    - tag descriptions do not end with a period and say what the type does not: unit, constraint,
      edge case, when the value is `null`.
2. Interfaces and types carry no comment, neither on the declaration nor on their fields: the name
   and the type must be enough.
3. A single-line `//` is reserved for nested helpers, the header of a data constant and "why" notes
   in a function body.
4. Never a file header or a comment before the imports. No comment in a `.tsx` file outside JSDoc
   (neither `//` nor `{/* */}` in JSX).
5. No single-line JSDoc, no ASCII table in a JSDoc, ASCII characters only (`->` rather than an
   arrow).
6. In the body, comment the non-obvious why, never the what; separate logical blocks with an empty
   line rather than a comment.
7. No `function` declared inside another function, except small local arrow functions or the
   methods of a factory that capture private state.

Directives (`"use client"`, `// eslint-disable-next-line`...) are not comments.

```ts
/**
 * Clamps the corner radius of a box so rounded corners never overlap.
 *
 * @param element - Box element read for radius, width and height
 * @returns The radius to draw, in scene pixels
 */
export function cornerRadius(element: WispenElement): number {
    return Math.max(0, Math.min(element.radius, element.width / 2, element.height / 2));
}
```

### Commits

Format: `SEVERITY: scope: Description`, with a single scope per commit.

- Severities: `MAJOR`, `MEDIUM`, `MINOR`, `BUILD`, `DOC`.
- Scopes: `app`, `components`, `data`, `hooks`, `lib`, `plugins`, `types`, `i18n` (`messages/`
  folder), `public`, `scripts`.
- `BUILD` and `DOC` have no scope: `BUILD: Update Next.js`, `DOC: Explain the plugin API`.

Examples: `MEDIUM: plugins: Add a draw.io exporter`,
`MINOR: components: Show the shortcut in the tool tooltip`.

## Writing a plugin

A plugin is a `WispenPlugin` object that provides shapes, tools, commands, exports and imports. The
application core uses exactly the same API (`src/plugins/core/`); `src/plugins/sticky/` is the
shortest complete example.

### 1. Create the folder

Create `src/plugins/<id>/` with an `index.ts` that exports the plugin, and one `.tsx` file per shape
component. The example below adds a "pill": a shape, the tool that draws it, a command that inserts
one and an export of the page text.

### 2. Draw the shape

`src/plugins/pill/shape.tsx`:

```tsx
import { TextBlock } from "@/components/canvas/text";
import { dashArray, labelArea } from "@/lib/canvas/render";
import type { ShapeDefinition, ShapeProps } from "@/types/plugin";

/**
 * Capsule with fully rounded ends and an optional centered label. Drawn in scene coordinates
 * with colors resolved by the render context, so the same component serves the canvas and
 * the exports.
 */
function Pill({ element, ctx }: ShapeProps) {
    const radius = Math.min(element.width, element.height) / 2;
    return (
        <>
            <rect
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                rx={radius}
                ry={radius}
                fill={ctx.color(element.fillColor, "fill")}
                stroke={ctx.color(element.strokeColor, "stroke")}
                strokeWidth={element.strokeWidth}
                strokeDasharray={dashArray(element)}
            />
            <TextBlock element={element} ctx={ctx} area={labelArea(element)} />
        </>
    );
}

export const pillShape: ShapeDefinition = {
    type: "pill",
    label: { en: "Pill", fr: "Pastille" },
    kind: "box",
    text: "label",
    fill: true,
    bindable: true,
    defaults: { fillColor: "blue", strokeColor: "blue" },
    defaultSize: { width: 140, height: 48 },
    Component: Pill,
    textBounds: (element) => labelArea(element),
};
```

The component receives `element` (the `WispenElement` to draw, in scene coordinates) and `ctx`
(`RenderContext`):

- `ctx.color(value, tone)` resolves a stored color: palette key (`"blue"`), CSS color or
  `"transparent"` (which gives `"none"`). `tone` is `"stroke"` for the saturated tone (strokes,
  text) or `"fill"` for the soft tone. On screen you get a CSS variable that follows the theme, on
  export a concrete color: never hard-code a color.
- `ctx.font(id)` resolves a font from the catalog; `ctx.mode` is `"screen"` or `"export"`;
  `ctx.editingId` designates the element whose text is being edited (`TextBlock` already hides it).

The same component serves PNG, SVG and PDF exports: no DOM-bound hook, and any SVG identifier
(`<filter>`, `<clipPath>`) derived from `element.id` so it stays unique. Reuse the helpers from
`src/lib/canvas/render.ts` (`dashArray`, `labelArea`, `cornerRadius`), from
`src/lib/canvas/geometry.ts` (`roundedPath`, `pointInPolygon`, `polygonOutline`,
`ellipseOutline`...) and `TextBlock` for text.

`ShapeDefinition` fields:

- `type`: identifier stored in `element.type`, unique across all extensions.
- `label`: display name (`LocalizedString`).
- `kind`: `"box"` (drawn like a rectangle), `"linear"` (from one point to another, with `points`)
  or `"freedraw"` (follows the pointer).
- `text`: `"label"` adds an optional text inside the shape (double-click or Enter), `"content"`
  makes it a text block edited as soon as it is created.
- `fill`, `radius`: show the fill and rounding settings in the properties panel.
- `keepAspectRatio`: resizing keeps the proportions without Shift (images).
- `bindable`: arrows can attach to it.
- `defaults`: properties applied at creation, on top of the current style.
- `defaultSize`: size used for a creation by a simple click.
- `Component`: rendering component, which receives `ShapeProps`.
- `hitTest(element, point, tolerance)`: precise click test in scene coordinates; by default, the
  whole bounding box.
- `outline(element, toward)`: point of the outline on the ray going from the center toward
  `toward`, where arrows attach; by default, the bounding rectangle.
- `textBounds(element)`: area where the text is laid out; by default, the box minus a margin.
- `paintMargin(element)`: distance drawn outside the box (shadow, halo), in scene pixels, so that
  exports do not crop it; by default, half the stroke width.

A shape can store its own data in `element.data` (a JSON-serializable object).

### 3. Declare the plugin

`src/plugins/pill/index.ts`:

```ts
import { RectangleHorizontal } from "lucide-react";

import { localize } from "@/lib/registry";
import type { ExporterDefinition, WispenPlugin } from "@/types/plugin";
import type { Page } from "@/types/scene";

import { pillShape } from "./shape";

/**
 * Lists the texts of a page as a Markdown outline.
 *
 * @param page - Page whose elements are read, bottom to top
 * @returns The page name as a heading, then one bullet per element carrying text
 */
function outline(page: Page): string {
    const items = page.elements
        .filter((element) => element.text.trim())
        .map((element) => `- ${element.text.replace(/\s*\n\s*/g, " ")}`);
    return [`# ${page.name}`, ...items].join("\n");
}

// Plain text export of every label, page by page.
const outlineExporter: ExporterDefinition = {
    id: "outline",
    label: { en: "Text outline", fr: "Plan texte" },
    extension: "md",
    mimeType: "text/markdown",
    scopes: ["selection", "page", "document"],
    options: [],
    export: async ({ pages }) =>
        new Blob([pages.map(outline).join("\n\n")], { type: "text/markdown" }),
};

// Example plugin: a shape, the tool drawing it, a command and an exporter.
export const pillPlugin: WispenPlugin = {
    id: "pill",
    name: { en: "Pills", fr: "Pastilles" },
    description: {
        en: "Rounded tags and a text outline export.",
        fr: "Pastilles arrondies et export du plan texte.",
    },
    shapes: [pillShape],
    tools: [
        {
            id: "pill",
            label: { en: "Pill", fr: "Pastille" },
            icon: RectangleHorizontal,
            shape: "pill",
            placement: "more",
        },
    ],
    commands: [
        {
            id: "pill-insert",
            label: { en: "Add a pill", fr: "Ajouter une pastille" },
            group: "plugin",
            icon: RectangleHorizontal,
            shortcuts: ["mod+alt+p"],
            run: (api) => {
                const center = api.getViewportCenter();
                const pill = api.createElement("pill", {
                    x: center.x - 70,
                    y: center.y - 24,
                    width: 140,
                    height: 48,
                    text: localize({ en: "New", fr: "Nouveau" }, api.locale()),
                });
                api.addElements([pill], { select: true });
                api.notify(
                    localize({ en: "Pill added", fr: "Ajout de la pastille" }, api.locale()),
                );
            },
        },
    ],
    exporters: [outlineExporter],
};
```

`WispenPlugin` fields: `id` (unique), `name` and `description` (`LocalizedString`, shown in the
interface), then the optional lists `shapes`, `tools`, `commands`, `exporters` and `importers`.

`ToolDefinition` fields:

- `id`: unique tool identifier, also used by `api.setTool(id)`.
- `label` and `icon`: name (tooltip, menu) and icon component accepting `className`.
- `shortcuts`: single keys that activate the tool (`["n"]`). Check that they are not already taken;
  when in doubt, leave them out.
- `shape`: type of shape created by dragging on the canvas. Absent for editing tools.
- `run(api)`: executed instead of activation (for example to open a file picker).
- `placement`: `"main"` (main bar, the default) or `"more"` ("More tools" menu).

`CommandDefinition` fields (command palette, shortcuts, shortcuts dialog):

- `id`, `label`, `icon` (optional).
- `group`: `"file"`, `"edit"`, `"view"`, `"arrange"`, `"text"`, `"page"`, `"tool"` or `"plugin"`,
  for the ordering in the palette.
- `shortcuts`: combinations such as `"mod+shift+e"`, where `mod` is Ctrl, or Cmd on macOS.
- `run(api)`: action, possibly asynchronous.
- `enabled(api)`: when it returns `false`, the command is hidden and its shortcut ignored.

`ExporterDefinition` fields:

- `id`, `label`, `extension` (without the dot), `mimeType`.
- `scopes`: offered scopes among `"selection"`, `"page"` and `"document"`.
- `options`: settings shown in the export dialog among `"background"`, `"theme"`, `"scale"`,
  `"padding"` and `"embedFonts"`; `[]` for a format that has none.
- `export(input)`: returns a promise of a `Blob`. `input.document` is the whole document,
  `input.pages` the pages already filtered by the scope (a single page containing the selection,
  the active page, or all pages) and `input.options` the chosen settings. For concrete colors, use
  `exportContext(theme).color(value, tone)` from `src/lib/canvas/colors.ts`.

`ImporterDefinition` fields (files dropped on the canvas or opened from the menu):

- `id`, `label`.
- `accept`: extensions and MIME types offered to the file picker
  (`[".excalidraw", "application/vnd.excalidraw+json"]`).
- `match(file, text)`: tells whether the file belongs to this importer; the first one that answers
  `true` wins. Test the content rather than the extension alone.
- `import(file, text)`: returns `{ kind: "document", document }`, opened as a new local document, or
  `{ kind: "elements", elements }`, pasted onto the active page. Pass a hand-built document through
  `normalizeDocument` (`src/lib/storage/serialization.ts`) to repair it like a `.wispen` file. See
  `src/plugins/excalidraw/`.

### 4. Use the editor API

Commands and tools receive `api: EditorApi`, which avoids touching the stores directly:

| Method                               | Role                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `getDocument()`                      | Whole document (pages, name, active page).                                                         |
| `getActivePage()`                    | Displayed page.                                                                                    |
| `getSelectedElements()`              | Selected elements of the active page, in page order.                                               |
| `select(ids)`                        | Replaces the selection.                                                                            |
| `createElement(type, patch?)`        | Builds an element of a registered type from the current style, the shape `defaults`, then `patch`. |
| `addElements(elements, { select? })` | Adds elements on top of the active page (one undo step).                                           |
| `updateElements(ids, patch)`         | Modifies elements; `patch` can be a function of the element. Attached arrows follow.               |
| `deleteElements(ids)`                | Deletes elements.                                                                                  |
| `setTool(id)`                        | Activates a tool, or runs its `run`.                                                               |
| `getViewportCenter()`                | Center of the visible area, in scene coordinates.                                                  |
| `notify(message, kind?)`             | Shows a notification (`"success"`, `"error"` or `"info"`).                                         |
| `locale()`                           | Active language (`"fr"` or `"en"`).                                                                |

### 5. Register and verify

Add the plugin to the array in `src/plugins/index.ts`. The array order gives the order of the
toolbar and menus; an identifier that is already taken (shape, tool, command, format) is ignored,
so a plugin cannot replace the core.

```ts
import { pillPlugin } from "./pill";

export const plugins: WispenPlugin[] = [
    corePlugin,
    stickyPlugin,
    shapesPlugin,
    excalidrawPlugin,
    drawioPlugin,
    pillPlugin,
];
```

Run `npm run check`, then verify in the application: creation by mouse and by simple click,
selection, resizing, text, attached arrows, dark theme and exports. A document containing a shape
whose plugin is missing still opens: the element is drawn as a dotted frame and stays movable.

### Translations

- Plugin labels (shapes, tools, commands, formats, plugin name): `LocalizedString`, either a string
  or `{ en, fr }`. English is the fallback when the active language is missing. On the interface
  side, resolve them with `localize(label, locale)` from `src/lib/registry.ts`; in a command, with
  `localize(text, api.locale())`. A plugin thus stays self-contained, with no translation file.
- Core interface: next-intl, one JSON file per namespace in `src/messages/en/` and
  `src/messages/fr/`, merged in `src/lib/i18n.ts`. In a component: `useTranslations("<namespace>")`;
  outside React: `getTranslator("<namespace>")`. Both languages must have exactly the same keys
  (`en` is typed after `fr`, the reference object in `src/lib/i18n.ts`). `LOCALES` in
  `src/types/settings.ts` lists the languages, English first, and `DEFAULT_LOCALE` is `"en"`.
- Routing: English is served at `/` and French at `/fr/`. The locale is applied client-side and the
  address is updated with `history.replaceState`, without a reload. French text follows French
  typography.
