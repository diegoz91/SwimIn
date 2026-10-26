/**
 * Funzioni accese o spente al lancio. Si cambiano dalle variabili d'ambiente di Vercel,
 * senza toccare il codice.
 */
/** Dirette (sezione Live): in arrivo dopo il lancio; con VITE_LIVE=on tornano nel menu. */
export const LIVE_ENABLED = import.meta.env.VITE_LIVE === 'on';
