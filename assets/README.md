# Local assets

- `vendor/matter.min.js`: Matter.js 0.20.0 from https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js; MIT license in `vendor/Matter-LICENSE.txt`.
- `fonts/inter.woff2`: lossless WOFF2 conversion of the Inter variable font from https://github.com/google/fonts/tree/main/ofl/inter (downloaded 2026-11-04); SIL OFL in `fonts/Inter-OFL.txt`. All characters and variable weights retained.
- `fonts/symbols.woff2`: Material Symbols Rounded variable font from https://github.com/google/material-design-icons/tree/master/variablefont (downloaded 2026-11-04); Apache 2.0 license in `fonts/Material-Symbols-LICENSE.txt`. Subset with fontTools using `--text=closesettings --flavor=woff2`, preserving ligature closure and variation axes.
- `icons/`: approved generated artwork with a pink circle and yellow rotated arch, softly blurred at their overlap, rendered at 180, 192 and 512 pixels. The `pink-yellow-*` filenames distinguish this artwork from previously cached icons. Favicon variants include a 32px PNG and a 16/32/48px ICO; the root `favicon.ico` provides a fallback. Opaque paper background with space for system icon masks.

No external requests are necessary at runtime. When replacing a cached asset, bump the cache version in `../sw.js`.
