import animate from 'tailwindcss-animate';
import plugin from 'tailwindcss/plugin';
import palette from 'tailwindcss/colors';

/**
 * Design system SwimIn — "acqua premium".
 *
 *  Abisso       #0A2738  testi forti, superfici scure
 *  Corsia       #0E6A97  azioni primarie (sostituisce la scala `blue` di Tailwind)
 *  Cloro        #12B5AE  accenti, stati positivi, dettagli del brand
 *  Piastrella   #F2F8FA  sfondo dell'app
 *  Galleggiante #E23D3D  solo SOS ed errori
 *
 * La scala `blue` è ridefinita sulla tinta Corsia: tutte le classi blue-* già
 * usate nei componenti adottano automaticamente il colore del brand.
 */
const corsia = {
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

const cloro = {
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
const slate = {
  50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
  400: '#617084', 500: '#536074',
  600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617',
};

const oro = { 50: '#FBF6EA', 100: '#F4E7C4', 300: '#E0C277', 500: '#B8892B', 600: '#9A7022', 700: '#7A581A', 800: '#634814' };

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
const ACCENTS = {
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
const ref = (prefix, name, shade) => `rgb(var(--${prefix}-${name}-${shade}) / <alpha-value>)`;
const scale = (prefix, name, shades) => Object.fromEntries(Object.keys(shades).map((k) => [k, ref(prefix, name, k)]));

const light = {};
const dark = {};
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

const colorScale = (name, shades) => scale('c', name, shades);
const textScale = (name, shades) => scale('t', name, shades);

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ...Object.fromEntries(Object.entries(ACCENTS).map(([name, shades]) => [name, colorScale(name, shades)])),
        // La scala `blue` usa le stesse variabili di Corsia.
        blue: colorScale('corsia', corsia),
        slate: colorScale('slate', slate),
        // bg-white = superficie delle schede (scura nel tema scuro); il testo bianco resta bianco (textColor sotto).
        white: 'rgb(var(--c-white) / <alpha-value>)',
        abisso: 'rgb(var(--c-abisso) / <alpha-value>)',
        piastrella: 'rgb(var(--c-page) / <alpha-value>)',
        // Rosso SOS: DEFAULT per sfondi, bordi e icone; 700 per i testi (contrasto AA su bianco).
        galleggiante: { DEFAULT: '#E23D3D', 700: '#C42828' },
        // compatibilità con il vecchio token
        brand: { 50: ref('c', 'corsia', 50), 100: ref('c', 'corsia', 100), 500: ref('c', 'corsia', 500), 600: ref('c', 'corsia', 600), 900: ref('c', 'corsia', 900) },
      },
      textColor: {
        ...Object.fromEntries(Object.entries(ACCENTS).map(([name, shades]) => [name, textScale(name, shades)])),
        blue: textScale('corsia', corsia),
        white: '#ffffff',
        abisso: 'rgb(var(--t-abisso) / <alpha-value>)',
        galleggiante: { DEFAULT: '#E23D3D', 700: 'rgb(var(--t-galleggiante-700) / <alpha-value>)' },
      },
      fontFamily: {
        sans: ['"Figtree Variable"', 'Figtree', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Barlow Condensed"', '"Figtree Variable"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // ombra fredda, tinta di blu, invece del grigio generico
        card: '0 1px 2px rgba(10, 39, 56, 0.06), 0 1px 1px rgba(10, 39, 56, 0.04)',
        lift: '0 10px 30px -12px rgba(10, 39, 56, 0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'zoom-in-95': 'zoomIn 0.2s ease-out',
        lap: 'lap 2.4s cubic-bezier(.45,.05,.55,.95) infinite',
        wake: 'wake 1.2s ease-in-out infinite',
      },
      keyframes: {
        // una bracciata lenta avanti e indietro nella corsia
        swim: { '0%, 100%': { transform: 'translateX(0)' }, '50%': { transform: 'translateX(14px)' } },
        // una vasca: il nuotatore va da un bordo all'altro, gira e torna
        lap: {
          '0%': { left: '0%', transform: 'translateX(0) scaleX(1)' },
          '46%': { left: '100%', transform: 'translateX(-100%) scaleX(1)' },
          '50%': { left: '100%', transform: 'translateX(-100%) scaleX(-1)' },
          '96%': { left: '0%', transform: 'translateX(0) scaleX(-1)' },
          '100%': { left: '0%', transform: 'translateX(0) scaleX(1)' },
        },
        // scia che si allunga dietro al nuotatore
        wake: { '0%, 100%': { opacity: '0.25' }, '50%': { opacity: '0.7' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        zoomIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  // Abilita le classi animate-in / fade-in / zoom-in-95 / slide-in-from-* usate nei componenti.
  darkMode: 'class',
  plugins: [
    animate,
    plugin(({ addBase }) => {
      addBase({
        ':root': { ...light, colorScheme: 'light' },
        ':root.dark': { ...dark, colorScheme: 'dark' },
        // Riquadri volutamente scuri anche nel tema chiaro (es. lettore video): tengono la tavolozza originale.
        '.palette-fixed': light,
      });
    }),
  ],
};
