import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';

/**
 * Content Security Policy nella pagina (meta): il browser carica script, stili, immagini e
 * connessioni solo da qui, da Appwrite (l'endpoint del progetto) e dalle API di Google Calendar.
 * Lo script in linea del tema è ammesso con il suo hash, calcolato qui a ogni build.
 * frame-ancestors non vale nei meta: lo copre X-Frame-Options in vercel.json.
 */
export function contentSecurityPolicy(html: string, endpoint: string): string {
  let appwrite = 'https://*.appwrite.io';
  let realtime = 'wss://*.appwrite.io';
  try {
    const u = new URL(endpoint);
    appwrite = u.origin;
    realtime = `wss://${u.host}`;
  } catch {
    /* endpoint mancante: si ammette qualsiasi progetto su appwrite.io */
  }
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${appwrite}`,
    `media-src 'self' blob: ${appwrite}`,
    "font-src 'self'",
    `connect-src 'self' ${appwrite} ${realtime} https://www.googleapis.com https://oauth2.googleapis.com`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const cspPlugin = (endpoint: string): Plugin => ({
  name: 'swimin-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(html, endpoint)}" />`),
  },
});

// Endpoint di Appwrite per la policy: variabile d'ambiente della build (Vercel, CI) o file .env.
const appwriteEndpoint = process.env.VITE_APPWRITE_ENDPOINT || loadEnv('production', process.cwd(), 'VITE_').VITE_APPWRITE_ENDPOINT || '';

export default defineConfig({
  plugins: [react(), cspPlugin(appwriteEndpoint)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    // Vite 8 (Rolldown): minificazione con Oxc e CSS con Lightning CSS, i predefiniti.
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Librerie che cambiano di rado in pezzi a parte: restano nella cache del browser tra un rilascio e l'altro.
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|@remix-run[\\/]router|scheduler)[\\/]/, priority: 20 },
            { name: 'appwrite', test: /[\\/]node_modules[\\/]appwrite[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
