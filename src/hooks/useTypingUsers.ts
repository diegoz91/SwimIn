import { useEffect, useState } from 'react';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';

type TypingRow = { userId: string; targetId: string; until: string };

/**
 * Chi mi sta scrivendo in questo momento. Le righe "typing" sono leggibili solo dal
 * destinatario (le scrive la Function), quindi arrivano in tempo reale solo a me.
 * Ogni riga scade da sola dopo `until`, anche se l'altra persona chiude la pagina.
 */
export function useTypingUsers(myId?: string | null): Set<string> {
    const [typing, setTyping] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!myId) return;
        const timers = new Map<string, number>();
        const stop = (userId: string) => {
            window.clearTimeout(timers.get(userId));
            timers.delete(userId);
            setTyping((prev) => {
                if (!prev.has(userId)) return prev;
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        };
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.typing}.documents`;
        const unsubscribe = client.subscribe(channel, (res: { events: string[]; payload: unknown }) => {
            const row = res.payload as TypingRow;
            if (!row?.userId) return;
            const ms = new Date(row.until).getTime() - Date.now();
            if (res.events.some((e) => e.endsWith('.delete')) || row.targetId !== myId || !(ms > 0)) return stop(row.userId);
            window.clearTimeout(timers.get(row.userId));
            timers.set(row.userId, window.setTimeout(() => stop(row.userId), Math.min(ms, 10_000) + 500));
            setTyping((prev) => (prev.has(row.userId) ? prev : new Set(prev).add(row.userId)));
        });
        return () => {
            unsubscribe();
            timers.forEach((t) => window.clearTimeout(t));
        };
    }, [myId]);

    return typing;
}
