import { useCallback, useEffect, useState } from 'react';
import { Query } from 'appwrite';
import { databases, client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import type { Message } from '@/types/types';

/**
 * Numero di messaggi non letti dell'utente, aggiornato in tempo reale.
 * `onNewMessage` viene chiamato all'arrivo di un nuovo messaggio (es. per un toast).
 */
export function useUnreadMessages(userId: string | undefined, onNewMessage?: (message: Message) => void) {
    const [count, setCount] = useState(0);

    const refresh = useCallback(async () => {
        if (!userId) return;
        try {
            const res = await databases.listDocuments<Message>(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections.messages, [
                Query.equal('receiverId', userId),
                Query.equal('isRead', false),
                Query.limit(1),
            ]);
            setCount(res.total);
        } catch (error) {
            console.warn('Conteggio messaggi non letti non disponibile:', error);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) return;
        refresh();
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.messages}.documents`;
        const unsubscribe = client.subscribe(channel, (event) => {
            const message = event.payload as Message;
            if (message?.receiverId !== userId) return;
            const isCreate = event.events.some((e) => e.endsWith('.create'));
            if (isCreate && !message.isRead) {
                setCount((n) => n + 1);
                onNewMessage?.(message);
            } else {
                refresh();
            }
        });
        return () => unsubscribe();
    }, [userId, refresh, onNewMessage]);

    return count;
}
