import React from 'react';
import ReactDOM from 'react-dom/client';
// Font ospitati con l'app (niente Google Fonts: nessun dato inviato a terzi).
import '@fontsource-variable/figtree';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@/styles/globals.css';
import SwimInApp from './App';
import { missingEnvVars } from '@/config/constants';
import { registerServiceWorker } from '@/services/push';
import { applyTheme, watchSystemTheme } from '@/utils/theme';

// Tema già applicato da index.html prima del disegno; qui si riallinea e si seguono i cambi del sistema.
applyTheme();
watchSystemTheme();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root non trovato nella pagina.');
}

const ConfigError: React.FC<{ vars: string[] }> = ({ vars }) => (
  <div className="min-h-screen flex items-center justify-center p-6">
    <div className="max-w-lg bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
      <h1 className="text-lg font-bold text-red-700 mb-2">Configurazione mancante</h1>
      <p className="text-slate-700 mb-3">
        Mancano le variabili d'ambiente di Appwrite. Crea un file <code>.env</code> partendo da <code>.env.example</code>
        (in locale) oppure impostale nelle Environment Variables di Vercel:
      </p>
      <ul className="list-disc pl-6 text-slate-800 font-mono text-sm">
        {vars.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    </div>
  </div>
);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {missingEnvVars.length > 0 ? <ConfigError vars={missingEnvVars} /> : <SwimInApp />}
  </React.StrictMode>
);

// Notifiche push e funzionamento senza rete (solo nella versione pubblicata).
registerServiceWorker();
