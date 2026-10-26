/**
 * Province della stessa regione (dati ISTAT in data/regioni.json, rigenerati da
 * scripts/anagrafica/update.mjs). Servono agli SOS Premium, che arrivano anche alle province vicine.
 */
import { readFileSync } from 'node:fs';

let REGIONS = null;
const load = () => (REGIONS ??= JSON.parse(readFileSync(new URL('./data/regioni.json', import.meta.url), 'utf8')));

export const regionOf = (code) => load()[String(code || '').toUpperCase()] || null;

/** La provincia indicata e le altre della sua regione (solo la provincia se la sigla non è nota). */
export function regionProvinces(code) {
  const p = String(code || '').toUpperCase();
  const region = regionOf(p);
  if (!region) return [p];
  return [p, ...Object.entries(load()).filter(([c, r]) => r === region && c !== p).map(([c]) => c)];
}
