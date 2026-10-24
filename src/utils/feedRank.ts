import type { EnrichedPost } from '@/types/types';

export type FeedMode = 'perte' | 'recenti';

interface RankContext {
    me: string;
    connections: Set<string>;
    following: Set<string>;
    now?: number;
}

/**
 * Feed "Per te": i post più rilevanti prima. Pesano il legame con l'autore (collegamento,
 * persona seguita, consigliato da un collegamento), le interazioni (reazioni, commenti,
 * ripubblicazioni) e l'età del post, che fa scendere piano piano anche i più popolari.
 */
export function relevanceOf(post: EnrichedPost, ctx: RankContext): number {
    const now = ctx.now ?? Date.now();
    const hours = Math.max(0, (now - new Date(post.$createdAt).getTime()) / 3_600_000);
    const weight = post.authorId === ctx.me
        ? 0.6
        : ctx.connections.has(post.authorId)
            ? 1
            : ctx.following.has(post.authorId)
                ? 0.85
                : post.recommendedBy
                    ? 0.7
                    : 0.5;
    const engagement = (post.likesCount || 0) + 2 * (post.commentsCount || 0) + 3 * (post.repostsCount || 0);
    const pollOpen = (post.pollOptions || []).length > 0 && (!post.pollEndsAt || new Date(post.pollEndsAt).getTime() > now) && post.myVote == null;
    const boost = 1 + Math.log1p(engagement) + (pollOpen ? 0.5 : 0);
    return (boost * weight) / Math.pow(hours + 2, 1.3);
}

export function rankForYou(posts: EnrichedPost[], ctx: RankContext): EnrichedPost[] {
    return posts
        .map((p, i) => ({ p, i, s: relevanceOf(p, ctx) }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((x) => x.p);
}

const KEY = 'swimin:feed';
export const savedFeedMode = (): FeedMode => {
    try {
        return localStorage.getItem(KEY) === 'recenti' ? 'recenti' : 'perte';
    } catch {
        return 'perte';
    }
};
export const saveFeedMode = (m: FeedMode) => {
    try {
        localStorage.setItem(KEY, m);
    } catch (err) {
        console.warn('Preferenza del feed non salvata:', err);
    }
};
