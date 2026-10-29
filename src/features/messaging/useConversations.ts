import { useCallback, useEffect, useRef, useState } from 'react';
import { databaseService } from '@/services/database';
import { useLiveCollection } from '@/hooks/useLiveCollection';
import { useTypingUsers } from '@/hooks/useTypingUsers';
import { useBlocks } from '@/context/BlocksContext';
import type { Message, StructureProfile, UserProfile } from '@/types/types';
import { applyIncoming, buildConversations, totalUnread, type Conversation } from './conversations';

type Profile = UserProfile | StructureProfile;

/**
 * Elenco delle conversazioni condiviso da widget e pagina Messaggi: ultimi messaggi (mandati e
 * ricevuti), non letti, chi sta scrivendo e chi è online, aggiornati in tempo reale.
 * `openIds`: conversazioni aperte in questo momento (i messaggi in arrivo lì non contano come non letti).
 */
export function useConversations(me: string | undefined, connections: string[] = [], enabled = true, openIds: string[] = []) {
    const [list, setList] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const typing = useTypingUsers(me);
    const blocks = useBlocks();
    const openRef = useRef(openIds);
    openRef.current = openIds;
    const connKey = connections.join(',');

    const load = useCallback(async () => {
        if (!me) return;
        setError(false);
        try {
            const messages = await databaseService.listMyRecentMessages(me);
            const others = [...new Set([...messages.map((m) => (m.senderId === me ? m.receiverId : m.senderId)), ...connKey.split(',').filter(Boolean)])];
            const profiles = new Map<string, Profile>();
            for (let i = 0; i < others.length; i += 100) {
                for (const p of await databaseService.getProfilesByIds(others.slice(i, i + 100))) profiles.set(p.userId || p.$id, p);
            }
            setList(buildConversations(me, messages, profiles, connKey.split(',').filter(Boolean)));
        } catch (err) {
            console.error('Conversazioni:', err);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [me, connKey]);

    useEffect(() => {
        if (enabled) void load();
    }, [enabled, load]);

    useLiveCollection(enabled && me ? 'messages' : null, (changes) => {
        let reload = false;
        setList((prev) => {
            let next = prev;
            for (const c of changes) {
                const m = c.payload as unknown as Message;
                if (m.senderId !== me && m.receiverId !== me) continue;
                if (c.type === 'create') {
                    const updated = applyIncoming(next, me!, m, openRef.current.includes(m.conversationId));
                    if (updated) next = updated;
                    else reload = true;
                } else if (c.type === 'update' && m.isRead && m.receiverId === me) {
                    next = next.map((x) => (x.conversationId === m.conversationId ? { ...x, unreadCount: Math.max(0, x.unreadCount - 1) } : x));
                }
            }
            return next;
        });
        if (reload) void load();
    }, 300);

    // Chi è online: aggiornato dal profilo dell'altra persona.
    useLiveCollection(enabled && me ? 'profiles' : null, (changes) => {
        const online = new Map(changes.filter((c) => c.type === 'update').map((c) => [String(c.payload.userId || c.id), c.payload.isOnline as boolean | undefined]));
        if (!online.size) return;
        setList((prev) => prev.map((x) => {
            const id = x.participant.userId || x.participant.$id;
            return online.has(id) ? { ...x, participant: { ...x.participant, isOnline: online.get(id) } } : x;
        }));
    }, 800);

    /** Aperta una conversazione: niente più non letti (la chat li segna come letti sul server). */
    const markRead = useCallback((conversationId: string) => {
        setList((prev) => prev.map((x) => (x.conversationId === conversationId ? { ...x, unreadCount: 0 } : x)));
        if (me) void databaseService.markMessagesAsRead(conversationId, me);
    }, [me]);

    const visible = list
        .filter((c) => !blocks.isHidden(c.participant.userId || c.participant.$id))
        .map((c) => ({ ...c, isParticipantTyping: typing.has(c.participant.userId || c.participant.$id) }));

    return { conversations: visible, loading, error, reload: load, markRead, unread: totalUnread(visible) };
}
