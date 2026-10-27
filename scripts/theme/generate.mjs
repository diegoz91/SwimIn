#!/usr/bin/env node
/**
 * Scrive src/styles/theme.css (Tailwind 4, configurazione in CSS) dalla tavolozza di
 * scripts/theme/palette.mjs. Ogni colore è una variabile CSS: con la classe `dark` su <html>
 * cambiano le variabili e tutta l'app passa al tema scuro senza toccare i componenti.
 * Sfondi e bordi leggono --c-…, i testi --t-… (nel tema scuro le tonalità scure diventano chiare).
 *
 *   node scripts/theme/generate.mjs           rigenera il file
 *   node scripts/theme/generate.mjs --check   errore se il file non è aggiornato (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACCENTS, corsia, slate, light, dark } from './palette.mjs';

const OUT = fileURLToPath(new URL('../../src/styles/theme.css', import.meta.url));
const v = (prefix, name, k) => `rgb(var(--${prefix}-${name}-${k}))`;
const block = (selector, vars, extra = '') =>
  `  ${selector} {\n${Object.entries(vars).map(([k, val]) => `    ${k}: ${val};`).join('\n')}${extra ? `\n    ${extra}` : ''}\n  }`;

const colors = [];
const texts = [];
for (const [name, shades] of Object.entries(ACCENTS)) {
  for (const k of Object.keys(shades)) {
    colors.push(`  --color-${name}-${k}: ${v('c', name, k)};`);
    texts.push(`  --text-color-${name}-${k}: ${v('t', name, k)};`);
  }
}
// La scala `blue` usa le variabili di Corsia: le classi blue-* hanno il colore del brand.
for (const k of Object.keys(corsia)) {
  colors.push(`  --color-blue-${k}: ${v('c', 'corsia', k)};`);
  texts.push(`  --text-color-blue-${k}: ${v('t', 'corsia', k)};`);
}
for (const k of Object.keys(slate)) colors.push(`  --color-slate-${k}: ${v('c', 'slate', k)};`);
// Compatibilità con il vecchio token "brand".
for (const k of [50, 100, 500, 600, 900]) colors.push(`  --color-brand-${k}: ${v('c', 'corsia', k)};`);

const css = `/*
 * GENERATO da scripts/theme/generate.mjs a partire da scripts/theme/palette.mjs: non modificarlo a mano.
 * Tema chiaro e scuro di SwimIn per Tailwind 4.
 */

/* Tema scuro con la classe \`dark\` su <html> (scelta in utils/theme.ts). */
@custom-variant dark (&:where(.dark, .dark *));

/* Colori: le classi leggono le variabili --c-… (sfondi, bordi) e --t-… (testi), definite sotto. */
@theme inline {
  --color-white: rgb(var(--c-white));
  --color-abisso: rgb(var(--c-abisso));
  --color-piastrella: rgb(var(--c-page));
  /* Rosso SOS: DEFAULT per sfondi, bordi e icone; 700 per i testi (contrasto AA su bianco). */
  --color-galleggiante: #e23d3d;
  --color-galleggiante-700: #c42828;
${colors.join('\n')}

  /* Testi: bg-white è la superficie delle schede (scura nel tema scuro), text-white resta bianco. */
  --text-color-white: #ffffff;
  --text-color-abisso: rgb(var(--t-abisso));
  --text-color-galleggiante: #e23d3d;
  --text-color-galleggiante-700: rgb(var(--t-galleggiante-700));
${texts.join('\n')}
}

@theme {
  --font-sans: 'Figtree Variable', Figtree, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-display: 'Barlow Condensed', 'Figtree Variable', system-ui, sans-serif;

  /* Ombre fredde, tinte di blu, invece del grigio generico. */
  --shadow-card: 0 1px 2px rgba(10, 39, 56, 0.06), 0 1px 1px rgba(10, 39, 56, 0.04);
  --shadow-lift: 0 10px 30px -12px rgba(10, 39, 56, 0.25);

  --animate-fade-in: fadeIn 0.5s ease-out;
  --animate-zoom-in-95: zoomIn 0.2s ease-out;
  --animate-lap: lap 2.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
  --animate-wake: wake 1.2s ease-in-out infinite;

  /* Una vasca: il nuotatore va da un bordo all'altro, gira e torna. */
  @keyframes lap {
    0% { left: 0%; transform: translateX(0) scaleX(1); }
    46% { left: 100%; transform: translateX(-100%) scaleX(1); }
    50% { left: 100%; transform: translateX(-100%) scaleX(-1); }
    96% { left: 0%; transform: translateX(0) scaleX(-1); }
    100% { left: 0%; transform: translateX(0) scaleX(1); }
  }
  /* La scia che si allunga dietro al nuotatore. */
  @keyframes wake {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 0.7; }
  }
  @keyframes fadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes zoomIn {
    0% { opacity: 0; transform: scale(0.95); }
    100% { opacity: 1; transform: scale(1); }
  }
}

@layer base {
${block(':root', light, 'color-scheme: light;')}
${block(':root.dark', dark, 'color-scheme: dark;')}
  /* Riquadri volutamente scuri anche nel tema chiaro (es. lettore video): tengono la tavolozza originale. */
${block('.palette-fixed', light)}
}
`;

const check = process.argv.includes('--check');
let current = '';
try {
  current = readFileSync(OUT, 'utf8');
} catch {
  current = '';
}
if (check) {
  if (current !== css) {
    console.error('src/styles/theme.css non è aggiornato: esegui node scripts/theme/generate.mjs');
    process.exit(1);
  }
  console.log('theme.css aggiornato');
} else {
  writeFileSync(OUT, css);
  console.log(`scritto ${OUT}`);
}
