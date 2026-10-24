import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconType } from '@/components/ui/Icon';
import { databaseService, type ProfileStats } from '@/services/database';
import { MONTHS } from '@/utils/dates';
import { cutText, plainText } from '@/utils/richText';
import { PremiumBadge } from './PremiumBadge';

const DAY_SHORT = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
const engagement = (p: ProfileStats['posts'][number]) => p.reactions + p.comments + p.reposts;

/**
 * Statistiche del proprio profilo (Premium): visite giorno per giorno, chi visita e come vanno i post.
 * Con il piano Base spiega cosa contiene e mostra comunque il numero di visite.
 */
export const StatsDashboard: React.FC<{ premium: boolean; /** Dove vedere l'elenco dei visitatori (null: nessun elenco, es. strutture). */ viewersLink?: string | null }> = ({ premium, viewersLink = '/profile?visite=1' }) => {
    const [stats, setStats] = useState<ProfileStats | null>(null);
    const [baseViews, setBaseViews] = useState<number | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let alive = true;
        if (premium) {
            databaseService.getMyStats().then((s) => alive && setStats(s)).catch((err) => { console.error('Statistiche:', err); if (alive) setError(true); });
        } else {
            databaseService.listProfileViews().then((v) => alive && setBaseViews(v.total)).catch((err) => console.warn('Visite al profilo:', err));
        }
        return () => { alive = false; };
    }, [premium]);

    if (!premium) return <PremiumInvite views={baseViews} viewersLink={viewersLink} />;
    if (error) return <EmptyCard icon="chart" title="Statistiche non disponibili" text="Non siamo riusciti a caricarle. Riprova tra qualche minuto." />;
    if (!stats) return <DashboardSkeleton />;

    return (
        <div className="space-y-5">
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi icon="user-circle" label="Visite al profilo" value={stats.viewsLast30} />
                <Kpi icon="like" label="Reazioni ai post" value={stats.totals.reactions} />
                <Kpi icon="comment" label="Commenti" value={stats.totals.comments} />
                <Kpi icon="share" label="Ripubblicazioni" value={stats.totals.reposts} />
            </dl>
            <ViewsChart days={stats.viewsPerDay} total={stats.viewsLast30} />
            <div className="grid lg:grid-cols-5 gap-5">
                <Visitors stats={stats} viewersLink={viewersLink} />
                <Posts posts={stats.posts} />
            </div>
        </div>
    );
};

const Card: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }> = ({ title, aside, children, className = '', id }) => (
    <section aria-labelledby={id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 ${className}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
            <h2 id={id} className="text-xl font-bold text-abisso">{title}</h2>
            {aside}
        </div>
        {children}
    </section>
);

const Kpi: React.FC<{ icon: IconType; label: string; value: number }> = ({ icon, label, value }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <dt className="flex items-center gap-2 text-sm text-slate-600">
            <Icon type={icon} className="w-4 h-4 text-corsia-600" /> {label}
        </dt>
        <dd className="font-display text-4xl font-bold text-abisso mt-1 tabular-nums">{value.toLocaleString('it-IT')}</dd>
    </div>
);

/** Visite al giorno: barre con griglia, date ogni settimana e il giorno migliore evidenziato. */
const ViewsChart: React.FC<{ days: ProfileStats['viewsPerDay']; total: number }> = ({ days, total }) => {
    const max = Math.max(...days.map((d) => d.views), 0);
    const top = Math.max(4, Math.ceil(max / 4) * 4);
    const best = max > 0 ? days.find((d) => d.views === max) : null;
    const W = 720, H = 220, L = 32, B = 28, T = 12;
    const bw = (W - L) / days.length;
    const y = (v: number) => T + (H - T - B) * (1 - v / top);
    const ticks = [0, top / 2, top];

    return (
        <Card
            id="stats-views"
            title="Visite al profilo"
            aside={<p className="text-sm text-slate-500">{total === 0 ? 'Nessuna visita negli ultimi 30 giorni' : best ? `Giorno migliore: ${DAY_SHORT(best.day)}, ${best.views} ${best.views === 1 ? 'visita' : 'visite'}` : ''}</p>}
        >
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Visite al profilo negli ultimi 30 giorni: ${total} in tutto${best ? `, massimo ${best.views} il ${DAY_SHORT(best.day)}` : ''}.`}>
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
                        <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#536074">{t}</text>
                    </g>
                ))}
                {days.map((d, i) => {
                    const h = (H - T - B) * (d.views / top);
                    const isBest = best && d.day === best.day;
                    return (
                        <g key={d.day}>
                            <rect x={L + i * bw + bw * 0.18} y={y(d.views)} width={bw * 0.64} height={Math.max(h, d.views ? 2 : 0)} rx="3" fill={isBest ? '#0B6F6A' : '#1A80AF'}>
                                <title>{`${DAY_SHORT(d.day)}: ${d.views} ${d.views === 1 ? 'visita' : 'visite'}`}</title>
                            </rect>
                            {(i % 7 === 0 || i === days.length - 1) && (
                                <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="#536074">{DAY_SHORT(d.day)}</text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </Card>
    );
};

const Visitors: React.FC<{ stats: ProfileStats; viewersLink: string | null }> = ({ stats, viewersLink }) => {
    const rows = [
        { label: 'Strutture', value: stats.viewersByKind.strutture, color: 'bg-corsia-600' },
        { label: 'Professionisti', value: stats.viewersByKind.professionisti, color: 'bg-cloro-600' },
        { label: 'Appassionati', value: stats.viewersByKind.appassionati, color: 'bg-corsia-300' },
        ...(stats.anonymousViews ? [{ label: 'In forma anonima', value: stats.anonymousViews, color: 'bg-slate-300' }] : []),
    ];
    const total = rows.reduce((n, r) => n + r.value, 0);
    return (
        <Card id="stats-visitors" title="Chi ti visita" className="lg:col-span-2" aside={viewersLink ? <Link to={viewersLink} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Vedi chi</Link> : undefined}>
            {total === 0 ? (
                <p className="text-slate-500">Ancora nessuna visita. Un profilo completo e qualche post aiutano a farsi trovare dalle strutture.</p>
            ) : (
                <ul className="space-y-4">
                    {rows.map((r) => {
                        const pct = Math.round((r.value / total) * 100);
                        return (
                            <li key={r.label}>
                                <div className="flex justify-between text-sm mb-1.5">
                                    <span className="font-semibold text-abisso">{r.label}</span>
                                    <span className="text-slate-600 tabular-nums">{r.value} <span className="text-slate-500">· {pct}%</span></span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                                    <div className={`h-full rounded-full ${r.color}`} style={{ width: `${pct}%` }} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
};

const Posts: React.FC<{ posts: ProfileStats['posts'] }> = ({ posts }) => {
    const [order, setOrder] = useState<'top' | 'recent'>('top');
    const list = useMemo(
        () => (order === 'top' ? [...posts].sort((a, b) => engagement(b) - engagement(a) || b.createdAt.localeCompare(a.createdAt)) : posts).slice(0, 8),
        [posts, order],
    );
    return (
        <Card
            id="stats-posts"
            title="I tuoi post"
            className="lg:col-span-3"
            aside={posts.length > 1 ? (
                <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-sm" role="group" aria-label="Ordina i post">
                    {(['top', 'recent'] as const).map((o) => (
                        <button key={o} type="button" onClick={() => setOrder(o)} aria-pressed={order === o} className={`px-3 py-1 rounded-full font-semibold ${order === o ? 'bg-white text-abisso shadow-sm' : 'text-slate-600 hover:text-abisso'}`}>
                            {o === 'top' ? 'Più interazioni' : 'Più recenti'}
                        </button>
                    ))}
                </div>
            ) : undefined}
        >
            {posts.length === 0 ? (
                <p className="text-slate-500">Pubblica un post per vedere reazioni, commenti e ripubblicazioni.</p>
            ) : (
                <ul className="divide-y divide-slate-100 -my-2">
                    {list.map((p) => (
                        <li key={p.id}>
                            <Link to={`/post/${p.id}`} className="flex items-center gap-4 py-3 group">
                                <span className="min-w-0 flex-1">
                                    <span className="block text-abisso group-hover:text-corsia-700 line-clamp-2 break-words">{p.text ? cutText(plainText(p.text), 140) : 'Post con foto o video'}</span>
                                    <span className="block text-sm text-slate-500 mt-0.5">{(() => { const d = new Date(p.createdAt); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; })()}</span>
                                </span>
                                <span className="flex items-center gap-3 text-sm text-slate-600 tabular-nums flex-shrink-0">
                                    <span className="flex items-center gap-1" title="Reazioni"><Icon type="like" className="w-4 h-4 text-slate-500" /><span className="sr-only">Reazioni:</span>{p.reactions}</span>
                                    <span className="flex items-center gap-1" title="Commenti"><Icon type="comment" className="w-4 h-4 text-slate-500" /><span className="sr-only">Commenti:</span>{p.comments}</span>
                                    <span className="flex items-center gap-1" title="Ripubblicazioni"><Icon type="share" className="w-4 h-4 text-slate-500" /><span className="sr-only">Ripubblicazioni:</span>{p.reposts}</span>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

const PremiumInvite: React.FC<{ views: number | null; viewersLink: string | null }> = ({ views, viewersLink }) => (
    <div className="grid lg:grid-cols-5 gap-5">
        <section className="lg:col-span-3 bg-white rounded-2xl border border-oro-300 shadow-sm p-6 sm:p-8">
            <p className="flex items-center gap-2 text-sm font-semibold text-oro-700"><PremiumBadge /> Incluse in SwimIn Premium</p>
            <h2 className="text-2xl font-bold text-abisso mt-2">Scopri chi ti cerca e cosa funziona</h2>
            <ul className="mt-4 space-y-2.5 text-slate-700">
                {['Visite al profilo giorno per giorno, ultimi 30 giorni', 'Quante strutture, professionisti e appassionati ti visitano', 'Reazioni, commenti e ripubblicazioni di ogni post', 'L’elenco completo di chi ha visto il tuo profilo'].map((t) => (
                    <li key={t} className="flex gap-2.5"><Icon type="check" className="w-5 h-5 text-cloro-700 flex-shrink-0 mt-0.5" /> {t}</li>
                ))}
            </ul>
            <Link to="/premium" className="inline-flex mt-6 px-5 py-2.5 rounded-full font-semibold bg-abisso text-white hover:bg-corsia-900">Scopri Premium</Link>
        </section>
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-xl font-bold text-abisso">Visite al profilo</h2>
            <p className="font-display text-5xl font-bold text-abisso mt-3 tabular-nums">{views === null ? '–' : views}</p>
            <p className="text-sm text-slate-500 mt-1">negli ultimi 30 giorni</p>
            {viewersLink && <Link to={viewersLink} className="inline-block mt-4 py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Vedi gli ultimi visitatori</Link>}
        </section>
    </div>
);

const EmptyCard: React.FC<{ icon: IconType; title: string; text: string }> = ({ icon, title, text }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <Icon type={icon} className="w-8 h-8 text-slate-400 mx-auto" />
        <p className="font-semibold text-abisso mt-3">{title}</p>
        <p className="text-slate-500 mt-1">{text}</p>
    </div>
);

const DashboardSkeleton: React.FC = () => (
    <div className="space-y-5" aria-busy="true" aria-label="Caricamento delle statistiche">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>
        <div className="h-72 rounded-2xl bg-white border border-slate-200 animate-pulse" />
    </div>
);
