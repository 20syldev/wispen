import * as fs from "fs";
import * as path from "path";

import sharp from "sharp";

// The favicon is the single source of every PNG icon of the web app manifest.
const source = "src/app/icon.svg";
const outDir = "public/icons";
const faviconFile = "public/favicon.ico";

interface Target {
    file: string;
    size: number;
    scale: number;
    bleed: boolean;
}

/**
 * PNG icons rendered from the favicon, one entry per file of the web app manifest.
 *
 * Maskable icons keep the logo inside the central safe zone, a circle of 80% of the side. The iOS
 * touch icon is painted edge to edge because iOS rounds the corners itself and fills transparent
 * pixels with black.
 */
const targets: Target[] = [
    { file: "icon-192.png", size: 192, scale: 1, bleed: false },
    { file: "icon-512.png", size: 512, scale: 1, bleed: false },
    { file: "maskable-512.png", size: 512, scale: 0.7, bleed: true },
    { file: "apple-touch-icon.png", size: 180, scale: 1, bleed: true },
];

// Sides of the images embedded in favicon.ico, from the tab icon to the legacy shortcut size.
const FAVICON_SIZES = [16, 32, 48];

interface Logo {
    viewBox: string;
    inner: string;
    background: string;
}

/**
 * Reads the logo markup, its view box and its background color.
 *
 * @param file - Path to the SVG logo, whose background shape carries id="background"
 * @returns The parts needed to compose every icon
 */
function readLogo(file: string): Logo {
    const svg = fs.readFileSync(file, "utf8");
    const [, tag, inner] = svg.match(/(<svg[^>]*>)([\s\S]*)<\/svg>/) ?? [];
    if (!tag || !inner) throw new Error(`No SVG content found in ${file}`);

    const viewBox = tag.match(/viewBox="([^"]+)"/)?.[1];
    if (!viewBox) throw new Error(`No viewBox found in ${file}`);

    const background = inner.match(/id="background"[^>]*fill="([^"]+)"/)?.[1];
    if (!background) throw new Error(`No fill found on the #background shape of ${file}`);

    return { viewBox, inner, background };
}

/**
 * Composes the SVG of one icon: the logo scaled and centered, over a full-bleed background
 * when the target needs one.
 *
 * @param logo - Parsed logo, nested as is inside the icon at the target scale
 * @param target - Icon to render: size is the side of the PNG in pixels, scale the share of the
 *   side taken by the logo, bleed paints the background edge to edge for platforms that apply
 *   their own mask
 * @returns Standalone SVG markup at the final pixel size
 */
function compose(logo: Logo, target: Target): string {
    const { size, scale, bleed } = target;
    const box = size * scale;
    const offset = (size - box) / 2;
    const backdrop = bleed
        ? `<rect width="${size}" height="${size}" fill="${logo.background}"/>`
        : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${backdrop}
        <svg x="${offset}" y="${offset}" width="${box}" height="${box}" viewBox="${logo.viewBox}">${logo.inner}</svg>
    </svg>`;
}

/**
 * Packs PNG images into an ICO container, so no extra dependency is needed for favicon.ico.
 *
 * @param images - PNG buffers paired with their side in pixels
 * @returns The bytes of the ICO file, each image stored as an embedded PNG
 */
function packIco(images: { size: number; data: Buffer }[]): Buffer {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);

    let offset = header.length + images.length * 16;
    const entries = images.map(({ size, data }) => {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(size, 0);
        entry.writeUInt8(size, 1);
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(data.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += data.length;
        return entry;
    });

    return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

/**
 * Renders favicon.ico from the SVG logo, edge to edge like the tab icon.
 *
 * @param logo - Parsed logo, composed once per size of the file
 */
async function buildFavicon(logo: Logo) {
    const images = [];
    for (const size of FAVICON_SIZES) {
        const svg = compose(logo, { file: "", size, scale: 1, bleed: false });
        const data = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
        images.push({ size, data });
    }
    fs.writeFileSync(faviconFile, packIco(images));
    console.log(`wrote ${faviconFile}`);
}

/**
 * Renders every PNG icon of the web app manifest and the favicon from the SVG logo.
 */
async function build() {
    const logo = readLogo(source);
    fs.mkdirSync(outDir, { recursive: true });

    for (const target of targets) {
        const out = path.join(outDir, target.file);
        await sharp(Buffer.from(compose(logo, target)))
            .png({ compressionLevel: 9 })
            .toFile(out);
        console.log(`wrote ${out}`);
    }

    await buildFavicon(logo);
}

build().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
