/**
 * Funzioni accese o spente al lancio. Si cambiano dalle variabili d'ambiente di Vercel,
 * senza toccare il codice.
 */
/** Dirette (sezione Live): in arrivo dopo il lancio; con VITE_LIVE=on tornano nel menu. */
export const LIVE_ENABLED = import.meta.env.VITE_LIVE === 'on';

/**
 * Fase di test chiusa: all'ingresso l'avviso da accettare (condizioni della fase di test).
 * Al lancio pubblico si spegne con VITE_BETA=off.
 */
export const BETA_ENABLED = import.meta.env.VITE_BETA !== 'off';
