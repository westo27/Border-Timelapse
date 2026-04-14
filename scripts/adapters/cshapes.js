import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { simplify } from '@turf/simplify';
import { union } from '@turf/union';
import { rewind } from '@turf/rewind';
import { featureCollection } from '@turf/helpers';

/**
 * CShapes 2.0 adapter — temporal range mode.
 *
 * CShapes is a single GeoJSON file where each feature represents a country's
 * territory for the period it was active (gwsyear–gweyear). To get a snapshot
 * at a given year, filter features where gwsyear <= year <= gweyear.
 *
 * Field reference:
 *   cntry_name  — country name
 *   gwsyear     — start year
 *   gwsmonth    — start month
 *   gwsday      — start day
 *   gweyear     — end year
 *   gwemonth    — end month
 *   gweday      — end day
 *
 * @param {string} filePath   - path to CShapes-2.0.geojson
 * @param {object[]} territories - territory definitions from scenario config
 * @param {number} year       - the keyframe year to extract
 * @param {number} month      - optional month (default 6 = mid-year)
 * @param {number} day        - optional day (default 15 = mid-month)
 * @param {number} tolerance  - simplification tolerance
 * @returns {object[]} array of { name, color, geometry }
 */
export async function processYear(filePath, territories, year, month = 6, day = 15, tolerance = 0.05) {
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing CShapes source file: ${filePath}\n` +
      `  Download CShapes-2.0.geojson from https://icr.ethz.ch/data/cshapes/ and place it there.`
    );
  }

  let geojson;
  try {
    const raw = await readFile(filePath, 'utf8');
    geojson = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse CShapes GeoJSON: ${filePath}\n  ${err.message}`);
  }

  // Convert target date and feature dates to comparable integers (YYYYMMDD)
  const targetDate = year * 10000 + month * 100 + day;

  const activeFeatures = geojson.features.filter(f => {
    const p = f.properties;
    const sy = p.gwsyear ?? p.GWSYEAR;
    const ey = p.gweyear ?? p.GWEYEAR;
    if (sy == null || ey == null) return false;
    const startDate = sy * 10000 + (p.gwsmonth ?? p.GWSMONTH ?? 1) * 100 + (p.gwsday ?? p.GWSDAY ?? 1);
    const endDate   = ey * 10000 + (p.gwemonth ?? p.GWEMONTH ?? 12) * 100 + (p.gweday ?? p.GWEDAY ?? 31);
    return targetDate >= startDate && targetDate <= endDate;
  });

  const results = [];

  for (const territory of territories) {
    const { color, matchNames, matchExclude, renameAfterYear } = territory;
    let name = territory.name;

    // Apply name override after a given year/month
    if (renameAfterYear) {
      const afterYear = renameAfterYear.year;
      const afterMonth = renameAfterYear.month ?? 1;
      if (year > afterYear || (year === afterYear && month >= afterMonth)) {
        name = renameAfterYear.name;
      }
    }

    const matching = activeFeatures.filter(f => {
      const cntryName = f.properties.cntry_name ?? f.properties.CNTRY_NAME ?? '';

      if (!matchNames.includes(cntryName)) return false;

      if (matchExclude && matchExclude.includes(cntryName)) return false;

      return true;
    });

    if (matching.length === 0) continue;

    let geometry;
    try {
      geometry = unionFeatures(matching, tolerance);
    } catch (err) {
      console.warn(`  Warning: failed to union "${name}" at ${year}: ${err.message}`);
      continue;
    }

    if (!geometry) {
      console.warn(`  Warning: empty geometry for "${name}" at ${year}`);
      continue;
    }

    results.push({ name, color, geometry });
  }

  return results;
}

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
  const simplified = simplify(feature, { tolerance, mutate: false });
  const rewound = rewind(simplified, { reverse: false, mutate: false });
  // Nudge coordinates at exactly ±180° slightly inward — points sitting on
  // the antimeridian break D3's clipping algorithm and invert polygon fill
  nudgeAntimeridian(rewound.geometry);
  return rewound;
}

function nudgeAntimeridian(geometry) {
  const coords = geometry.coordinates;
  function fix(ring) {
    for (const pt of ring) {
      if (pt[0] === 180)  pt[0] =  179.9999;
      if (pt[0] === -180) pt[0] = -179.9999;
    }
  }
  if (geometry.type === 'Polygon') {
    for (const ring of coords) fix(ring);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of coords) for (const ring of poly) fix(ring);
  }
}
