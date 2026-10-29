import { describe, expect, it } from 'vitest';
import type { Message, UserProfile } from '@/types/types';
import { applyIncoming, buildConversations, conversationIdOf, filterConversations, totalUnread } from './conversations';

const p = (id: string, over: Partial<UserProfile> = {}) => ({ $id: id, userId: id, userType: 'professional', firstName: id, lastName: '', ...over }) as UserProfile;
let n = 0;
const msg = (from: string, to: string, at: string, over: Partial<Message> = {}) =>
    ({ $id: `m${++n}`, conversationId: conversationIdOf(from, to), senderId: from, receiverId: to, content: `ciao da ${from}`, isRead: false, $createdAt: at, ...over }) as Message;

const profiles = new Map([['anna', p('anna', { title: 'Istruttrice FIN' })], ['bob', p('bob')], ['carla', p('carla')], ['dino', p('dino')], ['piscina', p('piscina')], ['sosp', p('sosp', { suspended: true })]]);

describe('buildConversations', () => {
    const messages = [
        msg('bob', 'me', '2026-10-29T09:00:00Z'),
        msg('me', 'anna', '2026-10-28T10:00:00Z', { isRead: true }),
        msg('anna', 'me', '2026-10-28T09:00:00Z', { isRead: true }),
        msg('bob', 'me', '2026-10-27T09:00:00Z'),
        msg('piscina', 'me', '2026-10-20T09:00:00Z', { isRead: true }),
        msg('sosp', 'me', '2026-10-29T10:00:00Z'),
    ];
    const list = buildConversations('me', messages, profiles, ['anna', 'carla', 'dino']);

    it('una conversazione per persona, dalla più recente, anche con chi non è un collegamento', () => {
        expect(list.map((c) => c.participant.$id)).toEqual(['bob', 'anna', 'piscina', 'carla', 'dino']);
    });
    it('ultimo messaggio (anche mandato da me) e non letti ricevuti', () => {
        const anna = list.find((c) => c.participant.$id === 'anna')!;
        expect(anna.lastMessage).toEqual({ content: 'ciao da me', sentAt: '2026-10-28T10:00:00Z', senderId: 'me' });
        expect(list[0].unreadCount).toBe(2);
        expect(totalUnread(list)).toBe(2);
    });
    it('i collegamenti senza messaggi in fondo, per iniziare; i sospesi esclusi', () => {
        expect(list.slice(-2).every((c) => c.lastMessage.sentAt === '')).toBe(true);
        expect(list.some((c) => c.participant.$id === 'sosp')).toBe(false);
    });
});

describe('filterConversations', () => {
    const list = buildConversations('me', [msg('bob', 'me', '2026-10-29T09:00:00Z', { content: 'Turno di sabato?' }), msg('anna', 'me', '2026-10-28T09:00:00Z', { isRead: true })], profiles);
    it('per nome, ruolo o testo; "Da leggere" solo con non letti', () => {
        expect(filterConversations(list, 'fin').map((c) => c.participant.$id)).toEqual(['anna']);
        expect(filterConversations(list, 'SABATO').map((c) => c.participant.$id)).toEqual(['bob']);
        expect(filterConversations(list, '', true).map((c) => c.participant.$id)).toEqual(['bob']);
    });
});

describe('applyIncoming', () => {
    const list = buildConversations('me', [msg('bob', 'me', '2026-10-29T09:00:00Z', { isRead: true }), msg('anna', 'me', '2026-10-28T09:00:00Z', { isRead: true })], profiles);
    it('porta in cima e conta il non letto, ma non se la finestra è aperta', () => {
        const next = applyIncoming(list, 'me', msg('anna', 'me', '2026-10-29T11:00:00Z', { content: 'Ci sei?' }), false)!;
        expect(next.map((c) => c.participant.$id)).toEqual(['anna', 'bob']);
        expect([next[0].unreadCount, next[0].lastMessage.content]).toEqual([1, 'Ci sei?']);
        expect(applyIncoming(list, 'me', msg('anna', 'me', '2026-10-29T11:00:00Z'), true)![0].unreadCount).toBe(0);
    });
    it('conversazione sconosciuta: null (va ricaricato l’elenco)', () => {
        expect(applyIncoming(list, 'me', msg('zeta', 'me', '2026-10-29T11:00:00Z'), false)).toBeNull();
    });
});
