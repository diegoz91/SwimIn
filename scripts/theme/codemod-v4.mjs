#!/usr/bin/env node
/**
 * Rinomina una tantum le classi cambiate tra Tailwind 3 e 4 nei componenti (stesso aspetto):
 * scala di ombre, raggi e sfocature spostata di un gradino, outline-none → outline-hidden,
 * flex-shrink-0 → shrink-0, bg-gradient-to-* → bg-linear-to-*. Tocca solo le classi intere,
 * con eventuali varianti (hover:, md:, …), modificatore ! e opacità /NN.
 *
 *   node scripts/theme/codemod-v4.mjs [--check]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EXACT = {
  'shadow-sm': 'shadow-xs', shadow: 'shadow-sm',
  'rounded-sm': 'rounded-xs', rounded: 'rounded-sm',
  'blur-sm': 'blur-xs', blur: 'blur-sm',
  'backdrop-blur-sm': 'backdrop-blur-xs', 'backdrop-blur': 'backdrop-blur-sm',
  'drop-shadow-sm': 'drop-shadow-xs', 'drop-shadow': 'drop-shadow-sm',
  'outline-none': 'outline-hidden',
  ring: 'ring-3',
  'flex-shrink-0': 'shrink-0', 'flex-shrink': 'shrink', 'flex-grow-0': 'grow-0', 'flex-grow': 'grow',
  'overflow-ellipsis': 'text-ellipsis', 'decoration-slice': 'box-decoration-slice', 'decoration-clone': 'box-decoration-clone',
};
const BARE = new Set(['shadow', 'rounded', 'blur', 'ring', 'backdrop-blur', 'drop-shadow']);
const rename = (u) => {
  if (EXACT[u]) return EXACT[u];
  let m = /^rounded-(t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)(-sm)?$/.exec(u);
  if (m) return `rounded-${m[1]}-${m[2] ? 'xs' : 'sm'}`;
  m = /^bg-gradient-to-(t|b|l|r|tl|tr|bl|br)$/.exec(u);
  if (m) return `bg-linear-to-${m[1]}`;
  return u;
};

// Una classe: varianti "xxx:" (anche con [..]), "!" facoltativo, utility, "/opacità" facoltativa.
const TOKEN = /(?<=^|[\s"'`{])((?:[a-z0-9-]+(?:\[[^\]\s]*\])?:)*)(!?)([a-z][a-z0-9-]*)(\/[0-9]+)?(?=$|[\s"'`}])/g;

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(p);
  }
};
walk('src');
files.push('index.html');

const check = process.argv.includes('--check');
let changed = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // Solo dentro le stringhe: className="…", '…', `…` (evita nomi di variabili e testi italiani in JSX).
  const out = src.replace(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g, (whole, q, body) => {
    if (!/[a-z]/.test(body)) return whole;
    // Una parola sola senza varianti ('blur', 'shadow'…) è più probabilmente un nome di evento o un testo.
    const single = !/\s/.test(body.trim()) && !body.includes(':');
    const next = body.replace(TOKEN, (t, variants, bang, util, op = '') => {
      if (single && BARE.has(util)) return t;
      const r = rename(util);
      return r === util ? t : `${variants}${bang}${r}${op}`;
    });
    return `${q}${next}${q}`;
  });
  if (out !== src) {
    changed++;
    if (!check) writeFileSync(f, out);
  }
}
console.log(`${changed} file ${check ? 'da aggiornare' : 'aggiornati'}`);
if (check && changed) process.exit(1);
