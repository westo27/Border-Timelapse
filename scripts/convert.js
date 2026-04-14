#!/usr/bin/env node
/**
 * convert.js — ingestion CLI
 *
 * Usage:
 *   node scripts/convert.js --scenario mongol_empire
 *   node scripts/convert.js --scenario ussr_collapse
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const VALID_ADAPTERS = ['geojson', 'shapefile', 'topojson', 'cshapes'];

// -- CLI args ------------------------------------------------------------------

const args = process.argv.slice(2);
const scenarioFlag = args.indexOf('--scenario');

if (scenarioFlag === -1 || !args[scenarioFlag + 1]) {
  console.error('Usage: node scripts/convert.js --scenario <scenario_name>');
  console.error('Example: node scripts/convert.js --scenario ussr_collapse');
  process.exit(1);
}

const scenarioName = args[scenarioFlag + 1];

// -- Main ---------------------------------------------------------------------

async function run() {
  console.log(`\nConverting scenario: ${scenarioName}`);

  const configPath = resolve(ROOT, 'scripts/scenarios', `${scenarioName}.json`);
  if (!existsSync(configPath)) {
    console.error(`Error: scenario config not found: ${configPath}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    console.error(`Error: failed to parse scenario config: ${configPath}\n  ${err.message}`);
    process.exit(1);
  }

  const tolerance = config.simplifyTolerance ?? 0.05;
  console.log(`  Simplification tolerance: ${tolerance}`);
  console.log(`  Keyframes: ${config.keyframes.length}`);
  console.log(`  Territories: ${config.territories.length}`);

  const keyframes = [];

  // -- CShapes adapter (single temporal file, filter by year) ------------------
  if (config.adapter === 'cshapes') {
    const { processYear } = await import('./adapters/cshapes.js');
    const filePath = resolve(ROOT, config.sourceFile);

    for (const kf of config.keyframes) {
      console.log(`\n  [${kf.label}]`);
      const territories = await processYear(
        filePath,
        config.territories,
        kf.year,
        kf.month ?? 6,
        kf.day ?? 15,
        tolerance
      );

      if (territories.length === 0) {
        console.warn(`  Warning: no territories produced for year ${kf.year}`);
      } else {
        for (const t of territories) console.log(`    + ${t.name}`);
      }

      keyframes.push({ year: kf.year, label: kf.label, territories });
    }

  // -- Snapshot adapters (one file per year) -----------------------------------
  } else {
    const sourceByYear = new Map();
    for (const sf of config.sourceFiles) {
      if (sf.year == null) {
        console.error(`Error: source file entry missing "year": ${JSON.stringify(sf)}`);
        process.exit(1);
      }
      if (!VALID_ADAPTERS.includes(sf.adapter)) {
        console.error(`Error: unsupported adapter "${sf.adapter}". Valid: ${VALID_ADAPTERS.join(', ')}`);
        process.exit(1);
      }
      sourceByYear.set(sf.year, sf);
    }

    for (const kf of config.keyframes) {
      const sourceFile = sourceByYear.get(kf.year);
      if (!sourceFile) {
        console.error(`Error: no source file configured for keyframe year ${kf.year}`);
        process.exit(1);
      }

      const filePath = resolve(ROOT, sourceFile.path);
      console.log(`\n  [${kf.label}] ${sourceFile.path}`);

      let territories;
      if (sourceFile.adapter === 'geojson') {
        const { processSnapshot } = await import('./adapters/geojson.js');
        territories = await processSnapshot(filePath, sourceFile, config.territories, tolerance);
      } else {
        console.error(`Error: adapter "${sourceFile.adapter}" not yet implemented`);
        process.exit(1);
      }

      if (territories.length === 0) {
        console.warn(`  Warning: no territories produced for year ${kf.year}`);
      } else {
        for (const t of territories) console.log(`    + ${t.name}`);
      }

      keyframes.push({ year: kf.year, label: kf.label, territories });
    }
  }

  // -- Write output ------------------------------------------------------------
  const output = {
    scenario: config.scenario,
    label: config.label,
    startYear: config.startYear,
    endYear: config.endYear,
    keyframes,
  };

  const outputDir = resolve(ROOT, 'data/output');
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `${config.scenario}.json`);

  const json = JSON.stringify(output, null, 2);
  const sizeKb = Math.round(Buffer.byteLength(json, 'utf8') / 1024);

  await writeFile(outputPath, json, 'utf8');

  console.log(`\nOutput written to: data/output/${config.scenario}.json`);
  console.log(`File size: ${sizeKb} KB`);

  if (sizeKb > 10240) {
    console.warn(`Warning: output exceeds 10 MB (${sizeKb} KB). Consider increasing simplifyTolerance.`);
  }

  console.log('\nDone.');
}

run().catch(err => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
