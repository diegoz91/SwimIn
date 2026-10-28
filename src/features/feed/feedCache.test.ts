import { afterEach, describe, expect, it } from 'vitest';
import type { EnrichedPost } from '@/types/types';
import { FEED_CACHE_MS, appendUnique, clearFeedSnapshot, readFeedSnapshot, saveFeedSnapshot } from './feedCache';

const post = (id: string) => ({ $id: id }) as EnrichedPost;

describe('appendUnique', () => {
    it('aggiunge in coda solo i post che non ci sono già', () => {
        expect(appendUnique([post('a'), post('b')], [post('b'), post('c'), post('c')]).map((p) => p.$id)).toEqual(['a', 'b', 'c']);
    });
});

describe('istantanea del feed', () => {
    afterEach(() => clearFeedSnapshot());
    it('torna uguale per la stessa persona e lo stesso ordine', () => {
        saveFeedSnapshot({ key: 'u1|perte', posts: [post('a')], hasMore: true, scrollTop: 640 }, 1000);
        expect(readFeedSnapshot('u1|perte', 2000)?.scrollTop).toBe(640);
        expect(readFeedSnapshot('u1|recenti', 2000)).toBeNull();
    });
    it('scade dopo mezz’ora e non salva un feed vuoto', () => {
        saveFeedSnapshot({ key: 'k', posts: [post('a')], hasMore: false, scrollTop: 0 }, 0);
        expect(readFeedSnapshot('k', FEED_CACHE_MS + 1)).toBeNull();
        saveFeedSnapshot({ key: 'k', posts: [], hasMore: false, scrollTop: 0 }, 0);
        expect(readFeedSnapshot('k', 1)).toBeNull();
    });
});
