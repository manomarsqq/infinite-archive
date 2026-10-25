# Infinite Archive

Somewhere past the last shelf of the last library there is an archive with no end. Every power anyone ever
imagined is written on a scroll inside it. This site lets you draw from it: scrolls of power, a tome of curses
that pays you in keys, and a quickstart wizard that draws a whole character for your story.

## Running it

```
npm install
npm run dev        # dev server on http://localhost:4000
npm test           # vitest
npm run viteBuild  # production build into dist/
```

Scroll and curse data is built from a Google Sheet by `build.js`. Put the sheet id and an API key in a `.env`
file (`SHEETID=...`, `SHEETSAPIKEY=...`) and run `npm run getData`. Without the built file the site shows the
sample data in `src/data/sampleValues.json`, which also documents the column layout a sheet needs.

## Themes

Five looks are built in (Luna, Olive, Silver, Classic, Midnight), picked from Options. A theme is one block of
variable overrides in `src/style.css`.

## License

GPL-3.0. The code began as a fork of an earlier gacha project and has since been rewritten; the art, names and
copy here are original.
