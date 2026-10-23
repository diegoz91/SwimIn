/** Reazioni ai post, come su LinkedIn. La prima è quella del tocco semplice su "Consiglia". */
export const REACTIONS = [
    { key: 'consiglio', label: 'Consiglia', past: 'Consigliato', emoji: '👍', color: 'text-corsia-700' },
    { key: 'applauso', label: 'Applauso', past: 'Applauso', emoji: '👏', color: 'text-emerald-700' },
    { key: 'adoro', label: 'Adoro', past: 'Adoro', emoji: '❤️', color: 'text-rose-600' },
    { key: 'felice', label: 'Felice', past: 'Felice', emoji: '😄', color: 'text-amber-600' },
    { key: 'interessante', label: 'Interessante', past: 'Interessante', emoji: '💡', color: 'text-yellow-700' },
    { key: 'sostegno', label: 'Sostegno', past: 'Sostegno', emoji: '🤝', color: 'text-violet-700' },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]['key'];

export const reactionOf = (key?: string | null) => REACTIONS.find((r) => r.key === key) || null;

/** Conteggi per reazione dal campo JSON del post; i post vecchi hanno solo likesCount. */
export function parseReactionCounts(raw: string | null | undefined, likesCount = 0): Partial<Record<ReactionKey, number>> {
    try {
        const parsed = raw ? (JSON.parse(raw) as Partial<Record<ReactionKey, number>>) : null;
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (err) {
        console.warn('Conteggi reazioni non leggibili:', err);
    }
    return likesCount > 0 ? { consiglio: likesCount } : {};
}

/** Le reazioni più usate, dalla più frequente (per il riepilogo sotto al post). */
export const topReactions = (counts: Partial<Record<ReactionKey, number>>, n = 3) =>
    REACTIONS.filter((r) => (counts[r.key] || 0) > 0)
        .sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0))
        .slice(0, n);
