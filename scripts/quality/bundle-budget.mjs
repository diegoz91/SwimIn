/**
 * Budget delle dimensioni del bundle (gzip), sulla cartella dist/ di `vite build`.
 * - iniziale: JS e CSS caricati da index.html (script, modulepreload, fogli di stile);
 * - pagina più pesante: il chunk caricato a richiesta più grande.
 * Uso: node scripts/quality/bundle-budget.mjs [dist] [rapporto.md]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = process.argv[2] || 'dist';
const OUT = process.argv[3];
const BUDGET = {
    initialJs: Number(process.env.BUDGET_INITIAL_JS_KB || 160),
    initialCss: Number(process.env.BUDGET_INITIAL_CSS_KB || 20),
    chunk: Number(process.env.BUDGET_CHUNK_KB || 130),
};

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const gz = (file) => gzipSync(readFileSync(join(DIST, file))).length;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const assets = readdirSync(join(DIST, 'assets')).map((f) => `assets/${f}`);
const js = assets.filter((f) => f.endsWith('.js'));
const sizes = Object.fromEntries([...js, ...assets.filter((f) => f.endsWith('.css'))].map((f) => [f, gz(f)]));

const initialJs = initial.filter((f) => f.endsWith('.js')).reduce((s, f) => s + (sizes[f] || 0), 0);
const initialCss = initial.filter((f) => f.endsWith('.css')).reduce((s, f) => s + (sizes[f] || 0), 0);
const lazy = js.filter((f) => !initial.includes(f)).sort((a, b) => sizes[b] - sizes[a]);
const biggest = lazy[0];

const checks = [
    ['JS iniziale', kb(initialJs), BUDGET.initialJs],
    ['CSS iniziale', kb(initialCss), BUDGET.initialCss],
    [`Chunk più pesante (${biggest?.replace('assets/', '')})`, kb(sizes[biggest] || 0), BUDGET.chunk],
];
const md = ['# Budget del bundle (gzip)', '', '| Voce | Dimensione | Budget | Esito |', '|---|---|---|---|',
    ...checks.map(([n, v, b]) => `| ${n} | ${v} KB | ${b} KB | ${v <= b ? 'ok' : '**oltre**'} |`),
    '', '## File iniziali', '', ...initial.map((f) => `- ${f}: ${kb(sizes[f] || 0)} KB`),
    '', '## Chunk a richiesta più grandi', '', ...lazy.slice(0, 15).map((f) => `- ${f}: ${kb(sizes[f])} KB`)];
if (OUT) writeFileSync(OUT, md.join('\n') + '\n');
let failed = 0;
for (const [n, v, b] of checks) {
    const ok = v <= b;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${n}: ${v} KB (budget ${b} KB)`);
}
if (failed) {
    console.log(`::error::Bundle oltre il budget in ${failed} voci (vedi perf.md sul branch ci-screenshots).`);
    process.exit(1);
}
