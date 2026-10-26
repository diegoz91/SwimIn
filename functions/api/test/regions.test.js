/** Regioni delle province (SOS Premium nelle province vicine): allineate all'anagrafica dell'app. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { regionOf, regionProvinces } from '../src/regions.js';

test('province della stessa regione', () => {
  assert.equal(regionOf('mi'), 'Lombardia');
  const lombardia = regionProvinces('MI');
  assert.equal(lombardia[0], 'MI');
  assert.ok(lombardia.includes('BG') && !lombardia.includes('TO'));
  assert.deepEqual(regionProvinces('XX'), ['XX']);
});

test('data/regioni.json coincide con le province dell’app', (t) => {
  const file = new URL('../../../src/data/generated/province.json', import.meta.url);
  if (!existsSync(file)) return t.skip('anagrafica dell’app non disponibile');
  const province = JSON.parse(readFileSync(file, 'utf8'));
  const regions = JSON.parse(readFileSync(new URL('../src/data/regioni.json', import.meta.url), 'utf8'));
  assert.deepEqual(regions, Object.fromEntries(province.map((p) => [p.code, p.region]).sort(([a], [b]) => a.localeCompare(b))));
});
