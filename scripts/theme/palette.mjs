/**
 * Design system SwimIn — "acqua premium": la tavolozza, unica fonte dei colori.
 * Da qui scripts/theme/generate.mjs scrive src/styles/theme.css (Tailwind 4, CSS nativo).
 *
 *  Abisso       #0A2738  testi forti, superfici scure
 *  Corsia       #0E6A97  azioni primarie (anche la scala `blue` di Tailwind usa questa tinta)
 *  Cloro        #12B5AE  accenti, stati positivi, dettagli del brand
 *  Piastrella   #F2F8FA  sfondo dell'app
 *  Galleggiante #E23D3D  solo SOS ed errori
 *  Oro                    solo SwimIn Premium
 */
/** Colori di Tailwind 3 usati dai componenti, fissati qui: con Tailwind 4 l'aspetto resta identico. */
const palette = {
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a' },
  orange: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12', 950: '#431407' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
  yellow: { 50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e', 900: '#713f12', 950: '#422006' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16' },
  emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63', 950: '#083344' },
  sky: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e', 950: '#082f49' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b' },
  violet: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065' },
  purple: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87', 950: '#3b0764' },
  pink: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724' },
  rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' },
};

export const corsia = {
  50: '#EEF7FB',
  100: '#D5ECF6',
  200: '#ABD8EC',
  300: '#74BCDC',
  400: '#3D9CC6',
  500: '#1A80AF',
  600: '#0E6A97',
  700: '#0C567B',
  800: '#0D4865',
  900: '#0E3C54',
  950: '#0A2738',
};

export const cloro = {
  50: '#EDFCFA',
  100: '#CFF6F2',
  200: '#9FECE5',
  300: '#66DCD3',
  400: '#33C6BD',
  500: '#12B5AE',
  600: '#0B918C',
  700: '#0B6F6A',
  800: '#0D5855',
  900: '#0E4846',
};

/**
 * Grigi dei testi secondari scuriti per il contrasto WCAG AA (4,5:1) anche sugli sfondi
 * Piastrella e Corsia-50: slate-400 e slate-500 di Tailwind restano sotto la soglia.
 */
export const slate = {
  50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
  400: '#617084', 500: '#536074',
  600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617',
};

export const oro = { 50: '#FBF6EA', 100: '#F4E7C4', 300: '#E0C277', 500: '#B8892B', 600: '#9A7022', 700: '#7A581A', 800: '#634814' };

/*
 * TEMA CHIARO E SCURO
 * Ogni colore è una variabile CSS (--c-…) letta dalle classi Tailwind: con la classe `dark`
 * su <html> le variabili cambiano e tutta l'app passa al tema scuro senza toccare i componenti.
 * - Grigi: la scala si capovolge (bg-slate-100 diventa un grigio scuro, text-slate-900 un quasi bianco).
 * - Colori del brand e di stato: le tinte chiare (50-300) diventano tinte scure per sfondi e bordi;
 *   per i testi (--t-…) le tonalità scure (600-950) diventano chiare, così i link restano leggibili.
 * - bg-white è la superficie delle schede, text-white resta bianco (testo sui pulsanti).
 */
const SURFACE = '#0F1D27';
const PAGE = '#08131A';
const SLATE_DARK = {
  50: '#132330', 100: '#182A37', 200: '#24384A', 300: '#33485B',
  400: '#8597AC', 500: '#9DADBF', 600: '#B6C3D1', 700: '#CDD6E0', 800: '#E2E8F0', 900: '#F1F5F9', 950: '#F8FAFC',
};
export const ACCENTS = {
  corsia, cloro, oro,
  red: palette.red, green: palette.green, amber: palette.amber, purple: palette.purple, orange: palette.orange,
  indigo: palette.indigo, sky: palette.sky, emerald: palette.emerald, yellow: palette.yellow, violet: palette.violet,
  rose: palette.rose, cyan: palette.cyan, teal: palette.teal, pink: palette.pink,
};

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};
const mix = (a, b, t) => {
  const [r1, g1, b1] = rgb(a).split(' ').map(Number);
  const [r2, g2, b2] = rgb(b).split(' ').map(Number);
  return `#${[r1 * t + r2 * (1 - t), g1 * t + g2 * (1 - t), b1 * t + b2 * (1 - t)].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
};

export const light = {};
export const dark = {};
for (const [name, shades] of Object.entries({ ...ACCENTS, slate })) {
  const base = shades[600] || shades[500];
  for (const [k, hex] of Object.entries(shades)) {
    light[`--c-${name}-${k}`] = rgb(hex);
    light[`--t-${name}-${k}`] = rgb(hex);
    if (name === 'slate') {
      dark[`--c-${name}-${k}`] = rgb(SLATE_DARK[k]);
      dark[`--t-${name}-${k}`] = rgb(SLATE_DARK[k]);
      continue;
    }
    const n = Number(k);
    const tint = { 50: 0.14, 100: 0.22, 200: 0.34, 300: 0.5 }[n];
    dark[`--c-${name}-${k}`] = rgb(tint ? mix(base, SURFACE, tint) : hex);
    const lighter = { 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 }[n];
    dark[`--t-${name}-${k}`] = rgb(lighter && shades[lighter] ? shades[lighter] : lighter ? mix(hex, '#ffffff', 0.35) : hex);
  }
}
Object.assign(light, { '--c-white': '255 255 255', '--c-page': rgb('#F2F8FA'), '--c-abisso': rgb('#0A2738'), '--t-abisso': rgb('#0A2738'), '--t-galleggiante-700': rgb('#C42828') });
Object.assign(dark, { '--c-white': rgb(SURFACE), '--c-page': rgb(PAGE), '--c-abisso': rgb('#1E3A4E'), '--t-abisso': rgb('#E8F1F6'), '--t-galleggiante-700': rgb('#FF9B9B') });

