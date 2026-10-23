import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import type { EnrichedPost } from '@/types/types';

const parseCounts = (raw: string | null | undefined, n: number) => {
    try {
        const arr = raw ? (JSON.parse(raw) as number[]) : [];
        return Array.from({ length: n }, (_, i) => Number(arr[i]) || 0);
    } catch (err) {
        console.warn('Sondaggio:', err);
        return Array.from({ length: n }, () => 0);
    }
};

const timeLeft = (endsAt: string) => {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) return null;
    const h = Math.ceil(ms / 3_600_000);
    return h < 24 ? `Chiude tra ${h} ${h === 1 ? 'ora' : 'ore'}` : `Chiude tra ${Math.ceil(h / 24)} giorni`;
};

/** Sondaggio dentro un post: si vota con un tocco, poi si vedono i risultati. */
export const PollView: React.FC<{ post: EnrichedPost }> = ({ post }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const options = post.pollOptions || [];
    const [counts, setCounts] = useState(() => parseCounts(post.pollCounts, options.length));
    const [myVote, setMyVote] = useState<number | null>(post.myVote ?? null);
    const [busy, setBusy] = useState(false);
    useEffect(() => setMyVote(post.myVote ?? null), [post.myVote]);
    useEffect(() => setCounts(parseCounts(post.pollCounts, options.length)), [post.pollCounts, options.length]);

    const left = post.pollEndsAt ? timeLeft(post.pollEndsAt) : null;
    const closed = !!post.pollEndsAt && !left;
    const total = counts.reduce((a, b) => a + b, 0);
    const showResults = myVote !== null || closed || post.authorId === user?.$id;

    const vote = async (option: number | null) => {
        if (!user || busy) return;
        setBusy(true);
        try {
            const res = await databaseService.votePoll(post.$id, option);
            setMyVote(res.myVote);
            setCounts(res.counts);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Voto non registrato.', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-3 rounded-2xl border border-slate-200 p-4" onClick={(e) => e.stopPropagation()}>
            <ul className="space-y-2">
                {options.map((label, i) => {
                    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
                    return (
                        <li key={i}>
                            {showResults ? (
                                <div className="relative overflow-hidden rounded-xl border border-slate-200 px-4 py-2.5">
                                    <div className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${myVote === i ? 'bg-corsia-100' : 'bg-slate-100'}`} style={{ width: `${pct}%` }} aria-hidden="true" />
                                    <div className="relative flex items-center justify-between gap-3 text-sm">
                                        <span className={`font-semibold ${myVote === i ? 'text-corsia-800' : 'text-abisso'}`}>{label}{myVote === i && <span className="sr-only"> (il tuo voto)</span>}</span>
                                        <span className="font-semibold text-slate-600">{pct}%</span>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    disabled={busy || !user}
                                    onClick={() => vote(i)}
                                    className="w-full rounded-full border-2 border-corsia-600 px-4 py-2 text-sm font-semibold text-corsia-700 hover:bg-corsia-50 transition-colors disabled:opacity-60"
                                >
                                    {label}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
            <p className="mt-3 text-xs text-slate-500 flex flex-wrap items-center gap-x-2">
                <span>{total === 1 ? '1 voto' : `${total} voti`}</span>
                <span aria-hidden="true">·</span>
                <span>{closed ? 'Sondaggio chiuso' : left || 'In corso'}</span>
                {myVote !== null && !closed && (
                    <button type="button" onClick={() => vote(null)} disabled={busy} className="font-semibold text-corsia-700 hover:underline">Ritira il voto</button>
                )}
            </p>
        </div>
    );
};
