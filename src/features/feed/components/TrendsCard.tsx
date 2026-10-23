import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';

/** Argomenti di tendenza: gli hashtag più usati negli ultimi 7 giorni. */
export const TrendsCard: React.FC = () => {
    const [trends, setTrends] = useState<{ tag: string; posts: number }[] | null>(null);
    useEffect(() => {
        let alive = true;
        databaseService.getTrends().then((t) => alive && setTrends(Array.isArray(t) ? t : [])).catch((err) => { console.warn('Tendenze:', err); if (alive) setTrends([]); });
        return () => { alive = false; };
    }, []);
    if (!trends || trends.length === 0) return null;
    return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-card p-5" aria-labelledby="trends-title">
            <h2 id="trends-title" className="text-xl font-bold text-abisso mb-3 flex items-center gap-2"><Icon type="hashtag" className="w-5 h-5 text-corsia-600" /> Di tendenza</h2>
            <ol className="space-y-2">
                {trends.slice(0, 6).map((t, i) => (
                    <li key={t.tag}>
                        <Link to={`/hashtag/${encodeURIComponent(t.tag)}`} className="flex items-baseline justify-between gap-3 group">
                            <span className="min-w-0">
                                <span className="text-xs text-slate-400 mr-2">{i + 1}</span>
                                <span className="font-semibold text-abisso group-hover:text-corsia-700 break-all">#{t.tag}</span>
                            </span>
                            <span className="text-xs text-slate-500 flex-shrink-0">{t.posts === 1 ? '1 post' : `${t.posts} post`}</span>
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
};
