import { describe, expect, it } from 'vitest';
import { rankForYou, relevanceOf } from './feedRank';
import type { EnrichedPost } from '@/types/types';

const now = Date.parse('2026-10-24T12:00:00Z');
const post = (id: string, authorId: string, hoursAgo: number, extra: Partial<EnrichedPost> = {}) =>
    ({ $id: id, authorId, $createdAt: new Date(now - hoursAgo * 3_600_000).toISOString(), likesCount: 0, commentsCount: 0, repostsCount: 0, ...extra }) as EnrichedPost;
const ctx = { me: 'me', connections: new Set(['amico']), following: new Set(['seguito']), now };

describe('feed Per te', () => {
    it('a parità di età, i collegamenti vengono prima degli sconosciuti', () => {
        expect(relevanceOf(post('a', 'amico', 3), ctx)).toBeGreaterThan(relevanceOf(post('b', 'altro', 3), ctx));
        expect(relevanceOf(post('a', 'seguito', 3), ctx)).toBeGreaterThan(relevanceOf(post('b', 'altro', 3), ctx));
    });

    it('le interazioni fanno salire un post, il tempo lo fa scendere', () => {
        const quiet = post('q', 'amico', 2);
        const lively = post('l', 'amico', 6, { likesCount: 40, commentsCount: 12 });
        const old = post('o', 'amico', 24 * 7, { likesCount: 40, commentsCount: 12 });
        expect(rankForYou([quiet, lively, old], ctx).map((p) => p.$id)).toEqual(['l', 'q', 'o']);
    });

    it('a punteggio uguale mantiene l’ordine originale', () => {
        const a = post('a', 'altro', 5);
        const b = post('b', 'altro', 5);
        expect(rankForYou([a, b], ctx).map((p) => p.$id)).toEqual(['a', 'b']);
    });
});
