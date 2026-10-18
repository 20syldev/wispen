# wispen

Free and simple whiteboard with rounded shapes, text, arrows that follow shapes, sticky notes and pages. Everything runs in the browser, nothing is sent to a server and documents stay on your machine.

## Features

- Shapes: rectangle, ellipse, diamond, triangle, hexagon, parallelogram, cylinder, star, speech bubble, sticky note, image, free text and pencil, with adjustable corner rounding.
- Straight, elbow and curved lines and arrows, attached to shapes, with labels and a choice of arrowheads.
- Text: about fifteen fonts (sans, serif, handwritten, mono, display), size, bold, italic, underline and alignment.
- Several pages per document, renamable, duplicable and reorderable.
- Dot or line grid, optional snapping, align and distribute.
- Keyboard shortcuts for everything, command palette (`Ctrl K`) and context menu.
- Automatic local saving (IndexedDB) of several documents, plus `.wispen` files to open and save.
- Exports to PNG, SVG (fonts embedded), multi-page PDF, JSON, Excalidraw and draw.io; import of Excalidraw files.
- Plugin system: shapes, tools, commands, exports and imports are added in a few files, and the built-in shapes use the same API.
- Installable PWA that works offline and opens `.wispen` files; responsive from phone to desktop; light / dark theme (next-themes) and a white or tinted canvas.
- English and French, picked from the browser language and remembered; English is served at `/`, French at `/fr/`; design driven solely by the tokens in `src/app/appearance/`.

## Stack

Next.js 16 (App Router, static export), React 19, strict TypeScript, Tailwind CSS v4, shadcn/ui (new-york, Radix primitives via `radix-ui`), next-intl, next-themes, cmdk, sonner, idb-keyval, jsPDF, lucide-react.

## Scripts

| Script           | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `npm run dev`    | Dev server on `127.0.0.1:9456`                              |
| `npm run build`  | Icons and service worker, then production build (to `out/`) |
| `npm run start`  | Serve `out/` on port 9457                                   |
| `npm run icon`   | `favicon.ico` and PWA icons from `src/app/icon.svg`         |
| `npm run sw`     | Compile the service worker into `public/sw.js`              |
| `npm run check`  | `tsc --noEmit` + ESLint + Prettier (check)                  |
| `npm run lint`   | ESLint                                                      |
| `npm run format` | Prettier + ESLint (write)                                   |

## Structure

```
scripts/                  PNG icon generation from the SVG logo
src/app/(site)/           Root layout + page for the default locale, served at /
src/app/[locale]/         Root layout + page for the other locales, served at /fr/
src/app/appearance/       Light, dark and tinted palettes, controls, overlays (design tokens)
src/components/           Editor shell, empty state, PWA, theme bridge
src/components/top/       Brand, tool dock, menu, document title, actions
src/components/bottom/    Page tabs, zoom and view controls
src/components/panel/     Properties panel: style, text, arrange, color
src/components/canvas/    Canvas, scene, grid, overlay, text blocks, context menu
src/components/dialogs/   Documents, export, shortcuts, command palette
src/components/ui/        Generated shadcn/ui components
src/data/                 Fonts, palettes and other static catalogs
src/hooks/                Sliding pill, glide, shortcuts, store subscription
src/lib/                  Canvas geometry, editor commands, storage, exports, stores, i18n
src/messages/             Messages per namespace (en/, fr/)
src/plugins/              Core shapes, sticky notes, shapes, Excalidraw, draw.io
src/types/                Shared types and settings
src/worker/               Service worker (offline)
```

## Notes

- Static export: no middleware, `trailingSlash`. The default locale (en) is served at `/`, French at `/fr/`; each locale is a distinct root layout sharing the `Shell` component. The language is applied on the client without reloading, so the editor keeps its state: the address moves to `/fr/` or `/` with `history.replaceState`, and the root page follows the saved language, else the browser language.
- Adding a language: add it to `LOCALES` in `src/types/settings.ts` and its folder to `src/messages/`, then register the catalogs in `src/lib/i18n.ts`.
- Plugins: each folder of `src/plugins/` exports a `WispenPlugin` declaring its shapes, tools, commands, exports and imports, registered in `src/plugins/index.ts`. The full guide, with a minimal example, is in [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Deployment: [`deploy.yml`](.github/workflows/deploy.yml) publishes to GitHub Pages on every push to `master`; set `BASE_PATH` at build time to serve the app from a subfolder, e.g. `BASE_PATH=/wispen npm run build`.
- To listen on every network interface in development, change the `dev` script to `next dev -H 0.0.0.0 -p 9456` and add your machine's address to `allowedDevOrigins` in [`next.config.ts`](next.config.ts).
- Keyboard shortcuts: `?` lists them all, `Ctrl K` opens the command palette.

## License

BSD 3-Clause, see [`LICENSE`](LICENSE).
