# Border Timelapse

> **Status: abandoned.** This repository is archived and unmaintained. It is published here for reference only.

A Node.js CLI for converting historical geographic data (GeoJSON, Shapefile, TopoJSON, CShapes) into a normalised keyframe JSON format, intended to drive an animated 9:16 border-map video generator for short-form video platforms.

Only the ingestion stage was built. The renderer, video export, and frontend were never started.

## What works

- CLI ingestion script (`scripts/convert.js`) that reads scenario configs and emits normalised keyframe JSON.
- Adapters for GeoJSON snapshots and CShapes-style temporal datasets.
- Three processed scenarios in `data/output/`:
  - Mongol Empire (1206–1368)
  - British Empire (1815–1960)
  - USSR collapse (1989–1991)
- A single-page HTML viewer (`viewer.html`) that renders the output JSON with vanilla SVG for sanity-checking.

## What was planned but not built

- Five remaining launch scenarios (Roman Empire, Alexander, Napoleon, WW2, USA expansion).
- Shapefile and TopoJSON adapter implementations (stubbed but unfinished).
- React frontend with D3 rendering and a timeline scrubber.
- Canvas-based frame capture and ffmpeg.wasm export.
- Validation script (`validate.js`).
- Server-side rendering pipeline.

## Usage

```bash
npm install
node scripts/convert.js --scenario mongol_empire
```

Output is written to `data/output/{scenario}.json`. To preview, open `viewer.html` in a browser and load one of the output files.

Source data files belong in `data/raw/` (gitignored). Source URLs per scenario are listed in `claude.md`.

## Output schema

```json
{
  "scenario": "mongol_empire",
  "label": "Mongol Empire",
  "startYear": 1206,
  "endYear": 1368,
  "keyframes": [
    {
      "year": 1206,
      "label": "1206",
      "territories": [
        { "name": "Mongol Empire", "color": "#c0392b", "geometry": { "type": "MultiPolygon", "coordinates": [] } }
      ]
    }
  ]
}
```

All geometry is GeoJSON in WGS84 (EPSG:4326), simplified with `@turf/simplify`.

## Project context

The original design notes, scenario list, and data sources are preserved in `claude.md` for anyone who wants to fork and continue.

## Licence

MIT. See [LICENSE](LICENSE).
