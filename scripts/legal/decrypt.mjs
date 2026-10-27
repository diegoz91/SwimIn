#!/usr/bin/env node
/**
 * Apre un'esportazione della conservazione (file scaricato da Admin › Richieste autorità) con la
 * chiave privata custodita fuori linea. Prima verifica l'impronta SHA-256 di ogni copia sigillata
 * contro il manifesto (catena di custodia), poi scrive una cartella leggibile da consegnare.
 *
 *   node scripts/legal/decrypt.mjs <esportazione.json> <escrow-private.pem> [cartella-uscita]
 *
 * Da usare solo su un computer fidato e scollegato; la cartella d'uscita contiene dati personali
 * in chiaro: consegnarla e cancellarla.
 */
import { createPrivateKey } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { openSealed, sha256 } from '../../functions/api/src/seal.js';

const [file, keyFile, outDir = 'conservazione-in-chiaro'] = process.argv.slice(2);
if (!file || !keyFile) {
  console.error('Uso: node scripts/legal/decrypt.mjs <esportazione.json> <escrow-private.pem> [cartella-uscita]');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(file, 'utf8'));
if (pkg?.manifest?.format !== 'swimin-conservazione-v1') {
  console.error('Il file non è un\'esportazione della conservazione di SwimIn.');
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const passphrase = process.env.ESCROW_PASSPHRASE || (await rl.question('Frase segreta della chiave privata: '));
rl.close();
const key = createPrivateKey({ key: readFileSync(keyFile, 'utf8'), passphrase });

const byId = new Map(pkg.items.map((i) => [i.id, i.sealed]));
const report = [];
let bad = 0;
mkdirSync(outDir, { recursive: true });
for (const [n, m] of pkg.manifest.items.entries()) {
  const sealed = byId.get(m.id);
  const ok = !!sealed && sha256(sealed) === m.sha256;
  if (!ok) {
    bad++;
    report.push(`${m.id}\t${m.kind}\tIMPRONTA NON CORRISPONDENTE O COPIA MANCANTE`);
    continue;
  }
  const value = openSealed(sealed, key);
  const name = `${String(n + 1).padStart(3, '0')}-${m.kind}.json`;
  writeFileSync(join(outDir, name), JSON.stringify(value, null, 2));
  report.push(`${m.id}\t${m.kind}\t${m.collectedAt}\tsha256 ${m.sha256}\tok → ${name}`);
}
const h = pkg.manifest.hold;
writeFileSync(join(outDir, 'manifesto.txt'), [
  `Conservazione ${h.id} — ${h.authority}, rif. ${h.reference}, ordine del ${h.orderDate}`,
  `Oggetto: ${h.subjectType} ${h.subjectId} — conservazione fino al ${h.until}`,
  `Esportata il ${pkg.manifest.exportedAt} da ${pkg.manifest.exportedBy}: ${pkg.manifest.reason}`,
  `Impronta del file di esportazione: sha256 ${sha256(readFileSync(file, 'utf8'))}`,
  '',
  ...report,
].join('\n') + '\n');
console.log(`${pkg.manifest.items.length - bad} copie verificate e aperte in ${outDir}${bad ? `, ${bad} con problemi (vedi manifesto.txt)` : ''}.`);
process.exit(bad ? 2 : 0);
