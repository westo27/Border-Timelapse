# Border Timelapse — Claude Code context

## What this project is

A no-code web tool for generating animated historical border map videos, exported as 9:16 MP4 files for TikTok, Instagram Reels, and YouTube Shorts. The user picks a historical scenario (e.g. Roman Empire), customises the style, and exports a video.

The broader strategy: use the tool to make and post videos, grow an audience, then sell creator access to the tool (freemium with watermark).

---

## Current build phase

**Phase 1 — data ingestion pipeline (start here)**

Build a Node.js CLI that converts historical geographic source data into a consistent internal keyframe JSON format. No frontend yet. No React yet. Just the ingestion script.

Once the ingestion script works for all 8 launch scenarios, move to Phase 2 (D3 renderer in React).

---

## Internal keyframe schema

Every scenario must be output in this exact format. This is the only format the app will ever consume — source data format does not matter, only this output matters.

```json
{
  "scenario": "roman_empire",
  "label": "Roman Empire",
  "startYear": -27,
  "endYear": 476,
  "keyframes": [
    {
      "year": -27,
      "label": "27 BC",
      "territories": [
        {
          "name": "Roman Republic",
          "color": "#c0392b",
          "geometry": {
            "type": "MultiPolygon",
            "coordinates": []
          }
        }
      ]
    }
  ]
}
```

**Notes on schema:**
- `year` is always a number. Negative = BC, positive = AD.
- `label` is the display string shown on the video (e.g. "27 BC", "117 AD")
- `geometry` is always a GeoJSON geometry object (Polygon or MultiPolygon)
- `color` is a hex string assigned per territory
- Multiple territories per keyframe are allowed (e.g. Axis + Allied in WW2)

---

## Ingestion script structure

```
/scripts
  convert.js          ← CLI entry point
  /adapters
    geojson.js        ← handles .geojson source files
    shapefile.js      ← handles .shp source files (use 'shapefile' npm package)
    topojson.js       ← handles .topojson files (use 'topojson-client' npm package)
  /scenarios
    roman_empire.json ← config per scenario (colors, labels, source files)
/data
  /raw                ← downloaded source files go here (gitignored)
  /output             ← processed keyframe JSON files go here
```

CLI usage:
```bash
node scripts/convert.js --scenario roman_empire
```

Each scenario has a config file in `/scripts/scenarios/` that defines:
- Which source files to use
- Which adapter to use
- Color assignments per territory
- Keyframe year labels

### Scenario config schema

Each scenario config file follows this format. The adapter is specified explicitly per source file — do not auto-detect from file extension.

```json
{
  "scenario": "roman_empire",
  "label": "Roman Empire",
  "startYear": -27,
  "endYear": 476,
  "simplifyTolerance": 0.05,
  "sourceFiles": [
    {
      "path": "data/raw/roman_empire/provinces.shp",
      "adapter": "shapefile",
      "yearField": "year",
      "nameField": "province"
    },
    {
      "path": "data/raw/roman_empire/boundaries.geojson",
      "adapter": "geojson",
      "yearField": "date",
      "nameField": "name"
    }
  ],
  "territories": [
    {
      "name": "Roman Republic",
      "color": "#c0392b",
      "sourceNameMatch": "Roman Republic"
    },
    {
      "name": "Roman Empire",
      "color": "#e74c3c",
      "sourceNameMatch": "Roman Empire"
    }
  ],
  "keyframes": [
    { "year": -27, "label": "27 BC" },
    { "year": 14, "label": "14 AD" },
    { "year": 117, "label": "117 AD" },
    { "year": 395, "label": "395 AD" },
    { "year": 476, "label": "476 AD" }
  ]
}
```

**Notes on config:**
- `adapter` must be one of: `"geojson"`, `"shapefile"`, `"topojson"` — always set explicitly, never inferred
- `yearField` and `nameField` tell the adapter which properties in the source data map to year and territory name
- `sourceNameMatch` links a territory color/label to a value in the source data's name field
- `simplifyTolerance` is optional — defaults to `0.05` if omitted. Override for smaller-scale maps that need more detail (e.g. `0.01` for USSR collapse)
- `keyframes` defines which years to extract — the script pulls geometry for each listed year from the source data

---

## Tech stack

| Area | Technology |
|------|-----------|
| Ingestion script | Node.js (no framework) |
| Frontend (phase 2) | React |
| Map rendering (phase 2) | D3.js — geo module for GeoJSON → SVG paths |
| Animation (phase 2) | Canvas API for frame capture |
| Client export (phase 2) | ffmpeg.wasm |
| Server export (phase 3) | Puppeteer + ffmpeg |
| Backend (phase 3) | Node.js / Express |
| Hosting | Vercel (frontend), Railway (backend later) |
| Static files | S3 + CloudFront |

**Do not introduce frameworks or libraries not listed here without flagging it first.**

---

## Key npm packages

- `shapefile` — reads .shp files, outputs GeoJSON
- `topojson-client` — converts TopoJSON to GeoJSON
- `@turf/simplify` — simplifies polygon complexity for smaller file sizes
- `@turf/projection` — reprojects coordinates if source is not WGS84

Do not use QGIS or any desktop GIS tooling. Everything must be scriptable.

---

## Data sources per scenario

| Scenario | Period | Source | Format |
|----------|--------|--------|--------|
| Roman Empire | 27 BC – 476 AD | AWMC / Project Mercury + siriusbontea/roman-empire (GitHub) | Shapefile + GeoJSON |
| Alexander the Great | 336 – 323 BC | AWMC | Shapefile |
| Mongol Empire | 1206 – 1368 | aourednik/historical-basemaps (GitHub) | GeoJSON |
| Napoleon | 1803 – 1815 | aourednik/historical-basemaps | GeoJSON |
| British Empire | 1815 – 1960 | aourednik/historical-basemaps | GeoJSON |
| WW2 Europe | 1939 – 1945 | Stanford Spatial History Project | Shapefile |
| USSR collapse | 1989 – 1991 | ioggstream/europe-historical-geojson (GitHub) | GeoJSON |
| USA expansion | 1776 – 1912 | Newberry Atlas of Historical County Boundaries | Shapefile |

Raw source files go in `/data/raw/`. This directory is gitignored — do not commit source data.

---

## Output geometry rules

- All output geometry must be in WGS84 (EPSG:4326). Reproject anything that isn't.
- Run `@turf/simplify` on all output polygons with `tolerance: 0.05` by default — this is sufficient for screen rendering without visible quality loss. Scenario configs can override this via `simplifyTolerance` for maps that need more or less detail.
- Output files go in `/data/output/` as `{scenario_name}.json`
- One file per scenario containing all keyframes.

---

## Phase 2 — React frontend (do not build yet)

When phase 1 is complete and all 8 scenario JSON files are validated, move to phase 2:

- React app consuming the scenario JSON files from `/data/output/`
- D3 geo module renders GeoJSON polygons as SVG paths
- Natural Earth or Mercator projection
- Timeline scrubber steps through keyframes with interpolation between them
- Canvas renderer for export (separate from SVG preview renderer)
- ffmpeg.wasm encodes Canvas frames to MP4

Target design is a three-panel layout: scenario browser left, map preview centre, style controls right. See plan document for full UI design.

**Do not start phase 2 until phase 1 is complete and tested.**

---

## What MVP means

The MVP is the smallest thing that produces a watchable 9:16 MP4. It is NOT the full editor UI.

MVP = ingestion script + D3 renderer + ffmpeg.wasm export. No accounts, no backend, no payments, no custom scenario editor.

---

## Coding conventions

- JavaScript throughout (not TypeScript) unless there is a strong reason to switch
- No unnecessary abstractions — keep it simple until complexity is needed
- Every script should be runnable from the command line with a clear usage message
- Console output should be descriptive — log what's happening at each step
- Errors should fail loudly with a clear message, not silently

### Error handling

- **Missing source files** in `/data/raw/` → fail with a clear message naming the missing file and where to download it
- **Corrupt/unparseable source files** → fail with the file path and the underlying parse error
- **Empty geometry output** → warn but don't fail (some keyframes may legitimately have no territory for a given year)
- **Unsupported adapter type** → fail immediately with the list of valid adapters

---

## Phase 1 completion criteria

Phase 1 is complete when all 8 scenario JSON files pass these checks:

- Output validates against the internal keyframe schema (correct structure, all required fields present)
- Each scenario has at least 3 keyframes
- All geometries are valid GeoJSON (no self-intersections, rings properly closed)
- All coordinates are in WGS84 range (longitude -180 to 180, latitude -90 to 90)
- File size is under 10 MB per scenario after simplification (warn if exceeded)
- The script runs end-to-end for each scenario without errors

Build a `validate.js` script that checks all of the above and reports pass/fail per scenario.

---

## What not to build yet

- Auth / accounts
- Payments / Stripe
- Backend API
- Server-side export
- Custom scenario editor
- Sound design
- Scenario marketplace

These come later, after the content strategy is validated.
