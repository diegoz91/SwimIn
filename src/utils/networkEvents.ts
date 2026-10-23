import { useEffect, useRef } from 'react';

/**
 * Notifica a tutta l'app che i collegamenti sono cambiati (richiesta inviata,
 * accettata, rifiutata o rimossa), così suggerimenti ed elenchi si aggiornano
 * subito senza ricaricare la pagina.
 */
const EVENT = 'swimin:network-changed';

export interface NetworkChange {
    type: 'sent' | 'accepted' | 'rejected' | 'removed' | 'remote';
    /** Profilo dell'altra persona, se noto. */
    userId?: string;
}

export const emitNetworkChange = (detail: NetworkChange) => window.dispatchEvent(new CustomEvent<NetworkChange>(EVENT, { detail }));

export function useNetworkChange(handler: (change: NetworkChange) => void) {
    const ref = useRef(handler);
    ref.current = handler;
    useEffect(() => {
        const listener = (e: Event) => ref.current((e as CustomEvent<NetworkChange>).detail);
        window.addEventListener(EVENT, listener);
        return () => window.removeEventListener(EVENT, listener);
    }, []);
}
