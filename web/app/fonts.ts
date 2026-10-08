import localFont from "next/font/local";

// Fonts from brand/fonts (OFL). See app/fonts/LICENSES.md.

export const instrumentSerif = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
});

export const departureMono = localFont({
  src: [{ path: "./fonts/DepartureMono-Regular.otf", weight: "400", style: "normal" }],
  variable: "--font-departure",
  display: "swap",
});

export const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});
