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

Scroll and curse data lives in `src/data/values.json`, one entry per line: 5,004 scrolls (417 of each kind, across
all ten ranks) and 90 curses. About one in nine is adult content, flagged NSFW and hidden by default. Edit it by hand to add your own. A scroll's stat letters have to add up to its
total and rank, as laid out in the Guide; `src/data/sampleValues.json` documents the columns.

`npm run getData` is optional and **replaces** `values.json` with the contents of a Google Sheet in the same
layout (sheet id and API key in a `.env` file as `SHEETID=...` and `SHEETSAPIKEY=...`). Nothing runs it
automatically.

## Custom domain

Set the domain under Settings, Pages on GitHub and point the domain's DNS at GitHub Pages (A records to
185.199.108.153, 185.199.109.153, 185.199.110.153 and 185.199.111.153, plus a `www` CNAME to the
`<user>.github.io` address). Then commit a `CNAME` file containing the bare domain in the repository root;
the deploy workflow serves the site from `/` when that file exists.

## Themes

The site is dark by default with a light mode. It follows the system setting until you pick one from the
header button or Options. Both modes are blocks of colour tokens at the top of `src/style.css`.

## License

GPL-3.0. The code began as a fork of an earlier gacha project and has since been rewritten; the art, names and
copy here are original, and so are the scrolls and curses in `src/data/values.json`. The eight stats, the rank
ladder and the column layout follow the Omni Gacha spreadsheet by CyberQueenJolyne, Desolatesabers and
Argotherat, whose entries shipped with earlier versions of this repository.
