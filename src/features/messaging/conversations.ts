import type { Message, StructureProfile, UserProfile } from '@/types/types';
import { messagePreview } from '@/utils/chatPreview';
import { displayNameOf, headlineOf } from '@/utils/profile';

type Profile = UserProfile | StructureProfile;

export interface Conversation {
    conversationId: string;
    participant: Profile;
    lastMessage: { content: string; sentAt: string; senderId: string };
    unreadCount: number;
    isParticipantTyping?: boolean;
}

/** Stesso id della Function (`conversationIdFor`): i due id in ordine, uniti da "_". */
export const conversationIdOf = (a: string, b: string) => [a, b].sort().join('_');
const idOf = (p: Profile) => p.userId || p.$id;

/**
 * Conversazioni come su LinkedIn: tutte quelle con almeno un messaggio (anche con chi non è un
 * collegamento: strutture, messaggi diretti Premium), dalla più recente; in fondo i collegamenti
 * con cui non hai ancora scritto, per iniziare. I messaggi arrivano dal più recente.
 */
export function buildConversations(me: string, messages: Message[], profiles: Map<string, Profile>, connections: string[] = []): Conversation[] {
    const byId = new Map<string, Conversation>();
    for (const m of messages) {
        const other = m.senderId === me ? m.receiverId : m.senderId;
        const participant = profiles.get(other);
        if (!participant || participant.suspended) continue;
        const id = m.conversationId || conversationIdOf(me, other);
        let c = byId.get(id);
        if (!c) {
            c = { conversationId: id, participant, lastMessage: { content: '', sentAt: '', senderId: '' }, unreadCount: 0 };
            byId.set(id, c);
        }
        if (m.$createdAt > c.lastMessage.sentAt) c.lastMessage = { content: messagePreview(m), sentAt: m.$createdAt, senderId: m.senderId };
        if (m.receiverId === me && !m.isRead) c.unreadCount += 1;
    }
    const withMessages = [...byId.values()].sort((a, b) => b.lastMessage.sentAt.localeCompare(a.lastMessage.sentAt));
    const talked = new Set(withMessages.map((c) => idOf(c.participant)));
    const starters = connections
        .filter((id) => id !== me && !talked.has(id))
        .map((id) => profiles.get(id))
        .filter((p): p is Profile => !!p && !p.suspended)
        .sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b), 'it'))
        .map((p) => ({ conversationId: conversationIdOf(me, idOf(p)), participant: p, lastMessage: { content: '', sentAt: '', senderId: '' }, unreadCount: 0 }));
    return [...withMessages, ...starters];
}

/** Ricerca per nome, ruolo o testo dell'ultimo messaggio; "Da leggere" solo con messaggi non letti. */
export function filterConversations(list: Conversation[], query: string, onlyUnread = false): Conversation[] {
    const q = query.trim().toLowerCase();
    return list.filter((c) => {
        if (onlyUnread && !c.unreadCount) return false;
        if (!q) return true;
        return [displayNameOf(c.participant), headlineOf(c.participant), c.lastMessage.content].some((t) => (t || '').toLowerCase().includes(q));
    });
}

/** Un messaggio nuovo (tempo reale) aggiorna la conversazione e la porta in cima; `open` = finestra aperta, già letto. */
export function applyIncoming(list: Conversation[], me: string, m: Message, open: boolean): Conversation[] | null {
    const id = m.conversationId;
    const i = list.findIndex((c) => c.conversationId === id);
    if (i === -1) return null;
    const c = { ...list[i], lastMessage: { content: messagePreview(m), sentAt: m.$createdAt, senderId: m.senderId } };
    if (m.receiverId === me && !m.isRead && !open) c.unreadCount += 1;
    return [c, ...list.slice(0, i), ...list.slice(i + 1)];
}

export const totalUnread = (list: Conversation[]) => list.reduce((n, c) => n + c.unreadCount, 0);
