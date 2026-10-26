import { useEffect, useRef } from 'react';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';

/**
 * Tempo reale per i dati che passano dalla Function (turni, staff, candidature, eventi…):
 * dopo ogni azione la Function scrive un "segnale" per ogni persona interessata (tabella
 * `signals`, leggibile solo da lei). Qui c'è un'unica iscrizione Realtime condivisa da tutta
 * l'app; ogni pagina chiede gli argomenti che le interessano e si ricarica da sola.
 *
 * Argomenti: "team:<struttura>", "staffchat:<struttura>", "job:<annuncio>", "event:<evento>",
 * "group:<gruppo>", "network:<persona>", "recs:<profilo>".
 */
type Listener = { match: (topic: string) => boolean; fire: (topic: string, kind: string) => void };

const listeners = new Set<Listener>();
let unsubscribe: (() => void) | null = null;

const ensureSubscription = () => {
    if (unsubscribe) return;
    const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.signals}.documents`;
    try {
        unsubscribe = client.subscribe(channel, (event: { events: string[]; payload: unknown }) => {
            if (!event.events.some((e) => e.endsWith('.create'))) return;
            const { topic = '', kind = '' } = (event.payload || {}) as { topic?: string; kind?: string };
            listeners.forEach((l) => {
                if (l.match(topic)) l.fire(topic, kind);
            });
        });
    } catch (err) {
        console.warn('Tempo reale non disponibile:', err);
    }
};

const release = () => {
    if (listeners.size || !unsubscribe) return;
    unsubscribe();
    unsubscribe = null;
};

/**
 * Esegue `onSignal` quando arriva un segnale per l'argomento (stringa esatta, prefisso con "*"
 * finale, oppure funzione). Più segnali ravvicinati diventano una sola chiamata.
 */
export function useSignal(topic: string | ((t: string) => boolean) | null, onSignal: (topic: string, kind: string) => void, delayMs = 250) {
    const handler = useRef(onSignal);
    handler.current = onSignal;
    const key = typeof topic === 'function' ? topic.toString() : topic;

    useEffect(() => {
        if (!topic) return;
        const match =
            typeof topic === 'function' ? topic : topic.endsWith('*') ? (t: string) => t.startsWith(topic.slice(0, -1)) : (t: string) => t === topic;
        let timer = 0;
        let last: [string, string] = ['', ''];
        const listener: Listener = {
            match,
            fire: (t, kind) => {
                last = [t, kind];
                window.clearTimeout(timer);
                timer = window.setTimeout(() => handler.current(last[0], last[1]), delayMs);
            },
        };
        listeners.add(listener);
        ensureSubscription();
        return () => {
            window.clearTimeout(timer);
            listeners.delete(listener);
            release();
        };
    }, [key, delayMs]); // eslint-disable-line react-hooks/exhaustive-deps
}
