/// <reference lib="esnext" />
/// <reference path="../assets.d.ts" />
// Inter as two files (latin, cyrillic for the coming RU interface) instead of the package CSS, which made Bun
// inline all 7 subsets into the stylesheet as data: URIs (~290 KB). The browser fetches a file only when a
// character of its unicode-range is on the page
import cyrillic from '@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2';
import latin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';

export const FONT_FILES = [
  { url: latin, unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { url: cyrillic, unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
];

export function loadFonts(doc: Document = document): void {
  try {
    FONT_FILES.forEach((f) => {
      const face = new FontFace('Inter Variable', `url(${f.url}) format('woff2')`, { weight: '100 900', style: 'normal', display: 'swap', unicodeRange: f.unicodeRange });
      // FontFaceSet.add lives in the setlike part of the DOM types, not in the IDE's default lib
      (doc.fonts as unknown as { add(f: FontFace): void }).add(face);
      void face.load().catch(() => { /* system font stays */ });
    });
  } catch {
    // FontFace missing (very old browser, tests): the system font stack of index.css is used
  }
}
