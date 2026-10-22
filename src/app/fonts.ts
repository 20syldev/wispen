import {
    Architects_Daughter,
    Bebas_Neue,
    Bricolage_Grotesque,
    Caveat,
    Comic_Neue,
    Geist,
    Instrument_Serif,
    Inter,
    JetBrains_Mono,
    Lora,
    Nunito,
    Pacifico,
    Patrick_Hand,
    Permanent_Marker,
    Playfair_Display,
    Space_Grotesk,
} from "next/font/google";

const geist = Geist({
    subsets: ["latin"],
    variable: "--font-geist",
    display: "swap",
    preload: false,
});
const instrumentSerif = Instrument_Serif({
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
    variable: "--font-instrument-serif",
    display: "swap",
    preload: false,
});
const nunito = Nunito({
    subsets: ["latin"],
    variable: "--font-nunito",
    display: "swap",
    preload: false,
});
const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
    preload: false,
});
const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-space-grotesk",
    display: "swap",
});
const bricolage = Bricolage_Grotesque({
    subsets: ["latin"],
    variable: "--font-bricolage",
    display: "swap",
    preload: false,
});
const bebasNeue = Bebas_Neue({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-bebas-neue",
    display: "swap",
    preload: false,
});
const playfair = Playfair_Display({
    subsets: ["latin"],
    variable: "--font-playfair",
    display: "swap",
    preload: false,
});
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });
const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-jetbrains-mono",
    display: "swap",
});
const caveat = Caveat({
    subsets: ["latin"],
    variable: "--font-caveat",
    display: "swap",
});
const patrickHand = Patrick_Hand({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-patrick-hand",
    display: "swap",
    preload: false,
});
const architectsDaughter = Architects_Daughter({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-architects-daughter",
    display: "swap",
    preload: false,
});
const permanentMarker = Permanent_Marker({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-permanent-marker",
    display: "swap",
    preload: false,
});
const comicNeue = Comic_Neue({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-comic-neue",
    display: "swap",
    preload: false,
});
const pacifico = Pacifico({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-pacifico",
    display: "swap",
    preload: false,
});

/**
 * Class names declaring every font variable, applied to <html>.
 *
 * Only the interface fonts (Space Grotesk, JetBrains Mono, Caveat) are preloaded: the browser
 * fetches the canvas fonts (Geist included) the first time something uses them. Keep the list in
 * sync with the catalog in data/fonts.ts.
 */
export const fontVariables = [
    geist,
    instrumentSerif,
    nunito,
    inter,
    spaceGrotesk,
    bricolage,
    bebasNeue,
    playfair,
    lora,
    jetbrainsMono,
    caveat,
    patrickHand,
    architectsDaughter,
    permanentMarker,
    comicNeue,
    pacifico,
]
    .map((font) => font.variable)
    .join(" ");
