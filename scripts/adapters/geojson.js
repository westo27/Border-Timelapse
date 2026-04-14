import { readFile } from 'fs/promises';
import { simplify } from '@turf/simplify';
import { union } from '@turf/union';
import { featureCollection } from '@turf/helpers';

/**
 * GeoJSON adapter — snapshot mode only.
 *
 * Each source file represents a single year snapshot. Features are matched
 * to territories via matchField / matchValues / matchExclude on feature properties.
 * All matching features are unioned into a single MultiPolygon per territory.
 *
 * @param {string} filePath  - absolute or CWD-relative path to the .geojson file
 * @param {object} sourceFile - the sourceFile config entry ({ year, path, adapter })
 * @param {object[]} territories - territory definitions from scenario config
 * @param {number} tolerance - simplification tolerance
 * @returns {object[]} array of { name, color, geometry } for this year
 */
export async function processSnapshot(filePath, sourceFile, territories, tolerance) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Missing source file: ${filePath}\n  ${err.message}`);
  }

  let geojson;
  try {
    geojson = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse GeoJSON: ${filePath}\n  ${err.message}`);
  }

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error(`Invalid GeoJSON (no features array): ${filePath}`);
  }

  const results = [];

  for (const territory of territories) {
    const { name, color, matchField, matchValues, matchExclude } = territory;

    const matching = geojson.features.filter(feature => {
      const props = feature.properties || {};

      // Must match on matchField
      const fieldVal = props[matchField];
      if (!matchValues.includes(fieldVal)) return false;

      // Must not match any matchExclude entry
      if (matchExclude) {
        for (const [excludeField, excludeValues] of Object.entries(matchExclude)) {
          if (excludeValues.includes(props[excludeField])) return false;
        }
      }

      return true;
    });

    if (matching.length === 0) {
      // Expected for some territories in some years (e.g. sub-khanates before they exist)
      continue;
    }

    let geometry;
    try {
      geometry = unionFeatures(matching, tolerance);
    } catch (err) {
      console.warn(`  Warning: failed to union geometry for "${name}" in ${filePath}: ${err.message}`);
      continue;
    }

    if (!geometry) {
      console.warn(`  Warning: empty geometry for "${name}" in ${filePath}`);
      continue;
    }

    results.push({ name, color, geometry });
  }

  return results;
}

/**
 * Unions an array of GeoJSON features into a single simplified geometry.
 * Uses turf v7 API: union(FeatureCollection) — requires ≥2 features.
 */
function unionFeatures(features, tolerance) {
  if (features.length === 1) {
    return simplifyGeometry(features[0], tolerance).geometry;
  }
  const fc = featureCollection(features);
  const merged = union(fc);
  if (!merged) throw new Error('union() returned null');
  return simplifyGeometry(merged, tolerance).geometry;
}

function simplifyGeometry(feature, tolerance) {
  return simplify(feature, { tolerance, mutate: false });
}
