#!/usr/bin/env node
/**
 * Aggiorna l'anagrafica di province e comuni dalla fonte ufficiale ISTAT
 * ("Codici statistici delle unità amministrative territoriali").
 *
 * Scrive:
 *  - src/data/generated/province.json     elenco province (sigla, nome, regione), incluso nell'app
 *  - public/data/comuni/<SIGLA>.json       comuni di ogni provincia, caricati quando servono
 *  - public/data/comuni/tutti.json         [comune, sigla] per la ricerca su tutta Italia
 *  - public/data/comuni/meta.json          data e fonte dell'aggiornamento
 *
 * Uso: node scripts/anagrafica/update.mjs [file-locale.csv|.xlsx]
 * Gira ogni mese nel workflow "Anagrafica comuni", che apre una PR se qualcosa cambia.
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIstatRows, readCsv, readXlsx, buildAnagrafica } from './istat.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// L'XLSX è il "link permanente" che ISTAT aggiorna per primo (fusioni di comuni,
// nuove province sarde dal 2026); il CSV resta come riserva.
const SOURCES = [
    'https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx',
    'https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv',
];

async function load() {
    const local = process.argv[2];
    if (local) {
        const buf = readFileSync(local);
        return { rows: local.endsWith('.xlsx') ? readXlsx(buf) : readCsv(buf), source: local };
    }
    const errors = [];
    for (const url of SOURCES) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'SwimIn-anagrafica/1.0 (+https://github.com/diegoz91/swimwaveup.0.0.1)' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            const rows = url.endsWith('.xlsx') ? readXlsx(buf) : readCsv(buf);
            parseIstatRows(rows); // verifica che le colonne attese ci siano
            return { rows, source: url };
        } catch (e) {
            errors.push(`${url}: ${e.message}`);
        }
    }
    throw new Error(`Nessuna fonte ISTAT disponibile:\n  ${errors.join('\n  ')}`);
}

const { rows, source } = await load();
const { province, comuni } = buildAnagrafica(parseIstatRows(rows));

// Controlli di plausibilità: se i dati sembrano sbagliati non tocchiamo nulla.
const total = Object.values(comuni).reduce((n, list) => n + list.length, 0);
if (total < 7500 || total > 8500) throw new Error(`Numero di comuni anomalo: ${total}`);
if (province.length < 100 || province.length > 120) throw new Error(`Numero di province anomalo: ${province.length}`);
for (const p of province) {
    if (!/^[A-Z]{2}$/.test(p.code)) throw new Error(`Sigla non valida: ${JSON.stringify(p)}`);
    if (!comuni[p.code]?.length) throw new Error(`Provincia senza comuni: ${p.code}`);
}

const dataDir = join(ROOT, 'public', 'data', 'comuni');
mkdirSync(dataDir, { recursive: true });
for (const f of readdirSync(dataDir)) if (f.endsWith('.json')) rmSync(join(dataDir, f));
for (const [code, list] of Object.entries(comuni)) writeFileSync(join(dataDir, `${code}.json`), JSON.stringify(list));
writeFileSync(
    join(dataDir, 'tutti.json'),
    JSON.stringify(Object.entries(comuni).flatMap(([code, list]) => list.map((name) => [name, code])).sort((a, b) => a[0].localeCompare(b[0], 'it')))
);
writeFileSync(join(dataDir, 'meta.json'), JSON.stringify({ source, comuni: total, province: province.length }, null, 2) + '\n');

// Copia compatta per la Function "api", che valida provincia e comune lato server.
const fnDir = join(ROOT, 'functions', 'api', 'src', 'data');
mkdirSync(fnDir, { recursive: true });
writeFileSync(join(fnDir, 'comuni.json'), JSON.stringify(Object.fromEntries(Object.entries(comuni).sort(([a], [b]) => a.localeCompare(b)))));
// Regione di ogni provincia: con Premium gli SOS di una struttura arrivano anche alle province della stessa regione.
writeFileSync(join(fnDir, 'regioni.json'), JSON.stringify(Object.fromEntries(province.map((p) => [p.code, p.region]).sort(([a], [b]) => a.localeCompare(b)))));

const genDir = join(ROOT, 'src', 'data', 'generated');
mkdirSync(genDir, { recursive: true });
writeFileSync(join(genDir, 'province.json'), JSON.stringify(province, null, 1) + '\n');

console.log(`Anagrafica aggiornata da ${source}: ${province.length} province, ${total} comuni.`);
