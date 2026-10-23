import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { databaseService, type ProfileStats } from '@/services/database';
import { PremiumBadge } from './PremiumBadge';
import { formatDate } from '@/utils/dates';

/**
 * Statistiche del proprio profilo (Premium): visite degli ultimi 30 giorni giorno per giorno,
 * chi visita, risultati dei post. Con il piano Base mostra un'anteprima sfocata e l'invito.
 */
export const ProfileStatsCard: React.FC<{ premium: boolean; onOpenViews?: () => void }> = ({ premium, onOpenViews }) => {
    const [stats, setStats] = useState<ProfileStats | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!premium) return;
        let alive = true;
        databaseService
            .getMyStats()
            .then((s) => alive && setStats(s))
            .catch((err) => { console.error('Statistiche:', err); if (alive) setError(true); });
        return () => { alive = false; };
    }, [premium]);

    const days = stats?.viewsPerDay || Array.from({ length: 30 }, (_, i) => ({ day: String(i), views: [1, 3, 2, 4, 2, 5, 3][i % 7] }));
    const max = Math.max(1, ...days.map((d) => d.views));

    return (
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6" aria-labelledby="stats-title" data-html2canvas-ignore="true">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                    <h2 id="stats-title" className="text-2xl font-bold text-abisso flex items-center gap-2">Statistiche <PremiumBadge /></h2>
                    <p className="text-sm text-slate-500">Ultimi 30 giorni, visibili solo a te.</p>
                </div>
                {premium && onOpenViews && (
                    <button onClick={onOpenViews} className="text-sm font-semibold text-corsia-700 hover:underline">Chi ha visto il profilo</button>
                )}
            </div>

            <div className={`relative ${premium ? '' : 'select-none'}`}>
                <div className={premium ? '' : 'blur-[3px] opacity-60 pointer-events-none'} aria-hidden={!premium}>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                        <Metric label="Visite al profilo" value={stats?.viewsLast30 ?? 87} />
                        <Metric label="Reazioni ai post" value={stats?.totals.reactions ?? 142} />
                        <Metric label="Commenti" value={stats?.totals.comments ?? 31} />
                        <Metric label="Ripubblicazioni" value={stats?.totals.reposts ?? 9} />
                    </dl>
                    <div className="flex items-end gap-[3px] h-24" role="img" aria-label={stats ? `Visite al giorno: massimo ${max}` : undefined}>
                        {days.map((d, i) => (
                            <div key={d.day + i} className="flex-1 rounded-t bg-corsia-500/80 hover:bg-corsia-600 min-h-[2px] transition-colors" style={{ height: `${(d.views / max) * 100}%` }} title={stats ? `${formatDate(d.day, 'short')}: ${d.views}` : undefined} />
                        ))}
                    </div>
                    {stats && (
                        <div className="mt-5 grid sm:grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="font-semibold text-abisso mb-2">Chi ti visita</p>
                                <ul className="space-y-1.5 text-slate-700">
                                    <li className="flex justify-between"><span>Strutture</span><strong>{stats.viewersByKind.strutture}</strong></li>
                                    <li className="flex justify-between"><span>Professionisti</span><strong>{stats.viewersByKind.professionisti}</strong></li>
                                    <li className="flex justify-between"><span>Appassionati</span><strong>{stats.viewersByKind.appassionati}</strong></li>
                                    {stats.anonymousViews > 0 && <li className="flex justify-between text-slate-500"><span>Anonimi</span><strong>{stats.anonymousViews}</strong></li>}
                                </ul>
                            </div>
                            <div>
                                <p className="font-semibold text-abisso mb-2">Post più apprezzati</p>
                                {stats.posts.length === 0 ? (
                                    <p className="text-slate-500">Pubblica un post per vedere come va.</p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {[...stats.posts].sort((a, b) => b.reactions + b.comments * 2 + b.reposts * 3 - (a.reactions + a.comments * 2 + a.reposts * 3)).slice(0, 3).map((p) => (
                                            <li key={p.id}>
                                                <Link to={`/post/${p.id}`} className="flex justify-between gap-3 hover:text-corsia-700">
                                                    <span className="truncate">{p.text || 'Post con foto o video'}</span>
                                                    <span className="text-slate-500 flex-shrink-0">{p.reactions} · {p.comments} · {p.reposts}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                    {error && <p className="mt-3 text-sm text-galleggiante">Statistiche non disponibili al momento.</p>}
                </div>
                {!premium && (
                    <div className="absolute inset-0 grid place-items-center">
                        <div className="bg-white/95 border border-oro-300 rounded-2xl px-5 py-4 text-center shadow-lift max-w-sm">
                            <p className="font-semibold text-abisso">Scopri chi ti cerca e cosa funziona</p>
                            <p className="text-sm text-slate-600 mt-1">Visite giorno per giorno, chi ti visita e i risultati dei tuoi post.</p>
                            <Link to="/premium" className="inline-block mt-3 px-4 py-2 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900">Scopri Premium</Link>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="rounded-2xl bg-piastrella p-3">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="font-display text-3xl font-bold text-abisso leading-tight">{value}</dd>
    </div>
);
