import type { EnrichedPost } from '@/types/types';

/** Post nuovi in coda senza doppioni (con la paginazione a offset un post appena pubblicato sposta le pagine). */
export function appendUnique(prev: EnrichedPost[], next: EnrichedPost[]): EnrichedPost[] {
    const seen = new Set(prev.map((p) => p.$id));
    return [...prev, ...next.filter((p) => !seen.has(p.$id) && seen.add(p.$id))];
}

/**
 * Il feed resta com'era quando torni alla home (da un post, un profilo, i messaggi): stessi post e
 * stesso punto di lettura, senza ricaricare. Vale per la sessione e per `FEED_CACHE_MS`; poi si riparte.
 */
export const FEED_CACHE_MS = 30 * 60_000;
export interface FeedSnapshot { key: string; posts: EnrichedPost[]; hasMore: boolean; scrollTop: number; savedAt: number }

let snapshot: FeedSnapshot | null = null;

export function saveFeedSnapshot(s: Omit<FeedSnapshot, 'savedAt'>, now = Date.now()) {
    snapshot = s.posts.length ? { ...s, savedAt: now } : null;
}

export function readFeedSnapshot(key: string, now = Date.now()): FeedSnapshot | null {
    if (!snapshot || snapshot.key !== key || now - snapshot.savedAt > FEED_CACHE_MS) return null;
    return snapshot;
}

export function clearFeedSnapshot() {
    snapshot = null;
}
