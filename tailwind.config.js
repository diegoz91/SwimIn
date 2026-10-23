import animate from 'tailwindcss-animate';

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

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: corsia,
        corsia,
        cloro,
        abisso: '#0A2738',
        piastrella: '#F2F8FA',
        galleggiante: '#E23D3D',
        // compatibilità con il vecchio token
        brand: { 50: corsia[50], 100: corsia[100], 500: corsia[500], 600: corsia[600], 900: corsia[900] },
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
  plugins: [animate],
};
