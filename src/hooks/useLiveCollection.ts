import { useEffect, useRef } from 'react';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';

type CollectionKey = keyof typeof APPWRITE_CONFIG.collections;
export type LiveChange = { type: 'create' | 'update' | 'delete'; id: string; payload: Record<string, unknown> };

/**
 * Tempo reale per le tabelle che il client può leggere (offerte, post, eventi…): Appwrite
 * manda solo le righe che l'utente ha il permesso di vedere. Le modifiche ravvicinate
 * arrivano insieme dopo `delayMs`, così una raffica di eventi diventa un solo aggiornamento.
 */
export function useLiveCollection(collection: CollectionKey | null, onChange: (changes: LiveChange[]) => void, delayMs = 400) {
    const handler = useRef(onChange);
    handler.current = onChange;

    useEffect(() => {
        if (!collection) return;
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections[collection]}.documents`;
        let queue: LiveChange[] = [];
        let timer = 0;
        let unsubscribe: (() => void) | null = null;
        try {
            unsubscribe = client.subscribe(channel, (event: { events: string[]; payload: unknown }) => {
                const type = (['create', 'update', 'delete'] as const).find((t) => event.events.some((e) => e.endsWith(`.${t}`)));
                if (!type) return;
                const payload = (event.payload || {}) as Record<string, unknown>;
                queue.push({ type, id: String(payload.$id || ''), payload });
                window.clearTimeout(timer);
                timer = window.setTimeout(() => {
                    const batch = queue;
                    queue = [];
                    handler.current(batch);
                }, delayMs);
            });
        } catch (err) {
            console.warn('Tempo reale non disponibile:', err);
        }
        return () => {
            window.clearTimeout(timer);
            unsubscribe?.();
        };
    }, [collection, delayMs]);
}
