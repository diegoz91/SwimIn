import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'swimin:chunk-reload';

/** Il chunk richiesto non esiste più (nuova versione pubblicata mentre l'app era aperta). */
export const isChunkError = (err: unknown) =>
    /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|is not a valid JavaScript MIME type/i.test(
        err instanceof Error ? err.message : String(err)
    );

/**
 * Come React.lazy, ma se dopo un aggiornamento dell'app il file della pagina non c'è più
 * ricarica la pagina una volta (al massimo ogni 30 secondi) per prendere la versione nuova,
 * invece di mostrare un errore. Se anche dopo il ricaricamento fallisce, l'errore arriva
 * all'ErrorBoundary, che propone di ricaricare.
 */
export function lazyPage<P extends object>(factory: () => Promise<{ default: ComponentType<P> }>) {
    return lazy(() =>
        factory().catch((err: unknown) => {
            if (!isChunkError(err)) throw err;
            let last = 0;
            try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { last = 0; }
            if (Date.now() - last < 30_000) throw err;
            try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e) { console.warn('sessionStorage non disponibile:', e); }
            window.location.reload();
            return new Promise<{ default: ComponentType<P> }>(() => undefined);
        })
    );
}
