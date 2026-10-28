import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon, type IconType } from '@/components/ui/Icon';
import { databaseService, type KindCounts, type ProfileStats } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import { provinceName } from '@/data/italy';
import { MONTHS } from '@/utils/dates';
import { changeOf, statsTips } from './statsTips';
import { ProfileViewersModal } from './ProfileViewersModal';
import { cutText, plainText } from '@/utils/richText';
import { PremiumBadge } from './PremiumBadge';

const DAY_SHORT = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
const engagement = (p: ProfileStats['posts'][number]) => p.reactions + p.comments + p.reposts;

/**
 * Statistiche del proprio profilo (Premium): visite giorno per giorno, chi visita e come vanno i post.
 * Con il piano Base spiega cosa contiene e mostra comunque il numero di visite.
 */
export const StatsDashboard: React.FC<{ premium: boolean; /** Elenco dei visitatori nella finestra sopra la pagina (le strutture non ce l'hanno). */ showViewers?: boolean }> = ({ premium, showViewers = true }) => {
    const [viewersOpen, setViewersOpen] = useState(false);
    const openViewers = showViewers ? () => setViewersOpen(true) : null;
    const viewers = showViewers ? <ProfileViewersModal open={viewersOpen} onClose={() => setViewersOpen(false)} /> : null;
    const [stats, setStats] = useState<ProfileStats | null>(null);
    const [baseViews, setBaseViews] = useState<number | null>(null);
    const [error, setError] = useState(false);
    const { user } = useAuth();

    useEffect(() => {
        let alive = true;
        if (premium) {
            databaseService.getMyStats().then((s) => alive && setStats(s)).catch((err) => { console.error('Statistiche:', err); if (alive) setError(true); });
        } else {
            databaseService.listProfileViews().then((v) => alive && setBaseViews(v.total)).catch((err) => console.warn('Visite al profilo:', err));
        }
        return () => { alive = false; };
    }, [premium]);

    if (!premium) return <><PremiumInvite views={baseViews} onViewers={openViewers} />{viewers}</>;
    if (error) return <EmptyCard icon="chart" title="Statistiche non disponibili" text="Non siamo riusciti a caricarle. Riprova tra qualche minuto." />;
    if (!stats) return <DashboardSkeleton />;

    return (
        <div className="space-y-5">
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi icon="user-circle" label="Visite al profilo" value={stats.viewsLast30} previous={stats.previous.views} />
                <Kpi icon="search" label="Comparse nelle ricerche" value={stats.searchesLast30} previous={stats.previous.searches} />
                <Kpi icon="like" label="Interazioni con i post" value={stats.totals.reactions + stats.totals.comments + stats.totals.reposts} previous={stats.previous.reactions + stats.previous.comments + stats.previous.reposts} />
                <Kpi icon="document" label="Post pubblicati" value={stats.postsLast30} previous={stats.previous.posts} />
            </dl>
            {user && <Tips tips={statsTips(user, stats)} />}
            <ViewsChart days={stats.viewsPerDay} total={stats.viewsLast30} />
            <div className="grid lg:grid-cols-5 gap-5">
                <Visitors stats={stats} onViewers={openViewers} />
                <Posts posts={stats.posts} />
            </div>
            {user?.userType === 'structure' && <Jobs jobs={stats.jobs} />}
            {viewers}
        </div>
    );
};

const Card: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }> = ({ title, aside, children, className = '', id }) => (
    <section aria-labelledby={id} className={`bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 ${className}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
            <h2 id={id} className="text-xl font-bold text-abisso">{title}</h2>
            {aside}
        </div>
        {children}
    </section>
);

/** Confronto con i 30 giorni precedenti, in parole (il colore aiuta, non è l'unico segnale). */
const Delta: React.FC<{ value: number; previous: number }> = ({ value, previous }) => {
    const change = changeOf(value, previous);
    if (change === null) return <span className="text-slate-500">{value > 0 ? 'nuovo rispetto ai 30 giorni prima' : 'nessun dato prima'}</span>;
    if (change === 0) return <span className="text-slate-500">come nei 30 giorni prima</span>;
    return (
        <span className={change > 0 ? 'text-cloro-700 font-semibold' : 'text-slate-600 font-semibold'}>
            {change > 0 ? '+' : '−'}{Math.abs(change)}% <span className="font-normal text-slate-500">rispetto ai 30 giorni prima</span>
        </span>
    );
};

const Kpi: React.FC<{ icon: IconType; label: string; value: number; previous: number }> = ({ icon, label, value, previous }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 min-w-0">
        <dt className="flex items-center gap-2 text-sm text-slate-600">
            <Icon type={icon} className="w-4 h-4 text-corsia-600 shrink-0" /> {label}
        </dt>
        <dd className="mt-1">
            <span className="block font-display text-4xl font-bold text-abisso tabular-nums">{value.toLocaleString('it-IT')}</span>
            <span className="block text-xs mt-1 leading-snug"><Delta value={value} previous={previous} /></span>
        </dd>
    </div>
);

/** "Cosa puoi fare": i consigli più utili adesso, ognuno con il suo pulsante. */
const Tips: React.FC<{ tips: ReturnType<typeof statsTips> }> = ({ tips }) => {
    if (!tips.length) return null;
    return (
        <Card id="stats-tips" title="Cosa puoi fare" aside={<p className="text-sm text-slate-500">Consigli dalle tue statistiche</p>}>
            <ul className={`grid gap-3 ${tips.length > 1 ? 'md:grid-cols-2' : ''} ${tips.length > 2 ? 'lg:grid-cols-3' : ''}`}>
                {tips.map((t) => (
                    <li key={t.id} className="rounded-2xl bg-piastrella border border-slate-200 p-4 flex flex-col">
                        <p className="font-semibold text-abisso">{t.title}</p>
                        <p className="text-sm text-slate-600 mt-1 flex-1">{t.text}</p>
                        <Link to={t.to} className="mt-3 self-start py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">{t.action}</Link>
                    </li>
                ))}
            </ul>
        </Card>
    );
};

/** Visite al giorno: barre in HTML (restano leggibili a ogni larghezza), date ogni settimana, giorno migliore evidenziato. */
const ViewsChart: React.FC<{ days: ProfileStats['viewsPerDay']; total: number }> = ({ days, total }) => {
    const max = Math.max(...days.map((d) => d.views), 0);
    const top = Math.max(4, Math.ceil(max / 4) * 4);
    const best = max > 0 ? days.find((d) => d.views === max) : null;
    // Una data ogni 7 giorni partendo da oggi all'indietro, così l'ultima etichetta è sempre "oggi" e non si sovrappone.
    const labelled = new Set(days.map((_, i) => i).filter((i) => (days.length - 1 - i) % 7 === 0));

    return (
        <Card
            id="stats-views"
            title="Visite al profilo"
            aside={<p className="text-sm text-slate-500">{total === 0 ? 'Nessuna visita negli ultimi 30 giorni' : best ? `Giorno migliore: ${DAY_SHORT(best.day)}, ${best.views} ${best.views === 1 ? 'visita' : 'visite'}` : ''}</p>}
        >
            <div role="img" aria-label={`Visite al profilo negli ultimi 30 giorni: ${total} in tutto${best ? `, massimo ${best.views} il ${DAY_SHORT(best.day)}` : ''}.`} className="flex gap-2">
                <div className="flex flex-col justify-between h-48 sm:h-56 text-xs text-slate-500 tabular-nums text-right w-6 shrink-0 -mt-2 pb-0" aria-hidden="true">
                    <span>{top}</span><span>{top / 2}</span><span>0</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="relative h-48 sm:h-56">
                        {[0, 50, 100].map((t) => <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${t}%` }} aria-hidden="true" />)}
                        <div className="absolute inset-0 flex items-end gap-[2px] sm:gap-1">
                            {days.map((d) => (
                                <div key={d.day} className="flex-1 h-full flex items-end" title={`${DAY_SHORT(d.day)}: ${d.views} ${d.views === 1 ? 'visita' : 'visite'}`}>
                                    <div className={`w-full rounded-t-xs ${best && d.day === best.day ? 'bg-cloro-700' : 'bg-corsia-500'}`} style={{ height: `${(d.views / top) * 100}%`, minHeight: d.views ? 3 : 0 }} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-[2px] sm:gap-1 mt-2 text-xs text-slate-500" aria-hidden="true">
                        {days.map((d, i) => (
                            <div key={d.day} className="flex-1 relative h-4">
                                {labelled.has(i) && <span className="absolute right-0 whitespace-nowrap">{i === days.length - 1 ? 'oggi' : DAY_SHORT(d.day)}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Card>
    );
};

const kindText = (k: KindCounts) => [
    k.strutture && `${k.strutture} ${k.strutture === 1 ? 'struttura' : 'strutture'}`,
    k.professionisti && `${k.professionisti} ${k.professionisti === 1 ? 'professionista' : 'professionisti'}`,
    k.appassionati && `${k.appassionati} ${k.appassionati === 1 ? 'appassionato' : 'appassionati'}`,
].filter(Boolean).join(', ');

/** Elenco breve con barre: ruoli o province di chi visita. */
const TopList: React.FC<{ title: string; rows: { label: string; count: number }[] }> = ({ title, rows }) => {
    const max = Math.max(1, ...rows.map((r) => r.count));
    return (
        <div className="min-w-0">
            <h3 className="text-sm font-semibold text-abisso mb-2">{title}</h3>
            <ul className="space-y-2">
                {rows.map((r) => (
                    <li key={r.label} className="text-sm">
                        <div className="flex justify-between gap-3">
                            <span className="text-slate-700 min-w-0 break-words">{r.label}</span>
                            <span className="text-slate-600 tabular-nums shrink-0">{r.count}</span>
                        </div>
                        <div className="h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                            <div className="h-full rounded-full bg-corsia-500" style={{ width: `${(r.count / max) * 100}%` }} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const Visitors: React.FC<{ stats: ProfileStats; onViewers: (() => void) | null }> = ({ stats, onViewers }) => {
    const provinces = stats.viewersByProvince.filter((p) => p.label).map((p) => ({ label: provinceName(p.label) || p.label, count: p.count }));
    const searchers = kindText(stats.searchersByKind);
    const rows = [
        { label: 'Strutture', value: stats.viewersByKind.strutture, color: 'bg-corsia-600' },
        { label: 'Professionisti', value: stats.viewersByKind.professionisti, color: 'bg-cloro-600' },
        { label: 'Appassionati', value: stats.viewersByKind.appassionati, color: 'bg-corsia-300' },
        ...(stats.anonymousViews ? [{ label: 'In forma anonima', value: stats.anonymousViews, color: 'bg-slate-300' }] : []),
    ];
    const total = rows.reduce((n, r) => n + r.value, 0);
    return (
        <Card id="stats-visitors" title="Chi ti visita" className="lg:col-span-2" aside={onViewers ? <button type="button" onClick={onViewers} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Vedi chi</button> : undefined}>
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
            {(stats.viewersByRole.length > 0 || provinces.length > 0) && (
                <div className="mt-6 pt-5 border-t border-slate-100 grid sm:grid-cols-2 lg:grid-cols-1 gap-5">
                    {stats.viewersByRole.length > 0 && <TopList title="Ruoli" rows={stats.viewersByRole} />}
                    {provinces.length > 0 && <TopList title="Province" rows={provinces} />}
                </div>
            )}
            <p className="mt-5 pt-4 border-t border-slate-100 text-sm text-slate-600">
                {stats.searchesLast30 === 0 ? 'Nessuna comparsa nelle ricerche negli ultimi 30 giorni.' : `Nelle ricerche ti hanno trovato ${searchers || 'alcune persone'}.`}
            </p>
        </Card>
    );
};

/** Strutture: come vanno gli ultimi annunci (persone che li hanno aperti e candidature). */
const Jobs: React.FC<{ jobs: ProfileStats['jobs'] }> = ({ jobs }) => (
    <Card id="stats-jobs" title="I tuoi annunci" aside={<Link to="/jobs/annunci" className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Gestisci gli annunci</Link>}>
        {jobs.length === 0 ? (
            <p className="text-slate-500">Pubblica un annuncio per vedere quante persone lo aprono e quante si candidano.</p>
        ) : (
            <ul className="divide-y divide-slate-100 -my-2">
                {jobs.map((j) => {
                    const rate = j.viewers ? Math.min(100, Math.round((j.applications / j.viewers) * 100)) : null;
                    return (
                        <li key={j.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <Link to={`/jobs/${j.id}`} className="min-w-0 flex-1 group">
                                <span className="block font-semibold text-abisso group-hover:text-corsia-700 break-words">{j.title}</span>
                                <span className="block text-sm text-slate-500">{[j.isSOS ? 'SOS' : '', j.isActive ? 'Aperto' : 'Chiuso'].filter(Boolean).join(' · ')}</span>
                            </Link>
                            <dl className="grid grid-cols-3 gap-4 text-sm shrink-0 sm:w-80">
                                <div><dt className="text-slate-500">Aperto da</dt><dd className="font-semibold text-abisso tabular-nums">{j.viewers} {j.viewers === 1 ? 'persona' : 'persone'}</dd></div>
                                <div><dt className="text-slate-500">Candidature</dt><dd className="font-semibold text-abisso tabular-nums">{j.applications}{j.newApplications > 0 && <span className="font-normal text-corsia-700"> · {j.newApplications} {j.newApplications === 1 ? 'nuova' : 'nuove'}</span>}</dd></div>
                                <div><dt className="text-slate-500">Si candida</dt><dd className="font-semibold text-abisso tabular-nums">{rate === null ? '–' : `${rate}%`}</dd></div>
                            </dl>
                        </li>
                    );
                })}
            </ul>
        )}
    </Card>
);

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
                        <button key={o} type="button" onClick={() => setOrder(o)} aria-pressed={order === o} className={`px-3 py-1 rounded-full font-semibold ${order === o ? 'bg-white text-abisso shadow-xs' : 'text-slate-600 hover:text-abisso'}`}>
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
                                <span className="flex items-center gap-3 text-sm text-slate-600 tabular-nums shrink-0">
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

const PremiumInvite: React.FC<{ views: number | null; onViewers: (() => void) | null }> = ({ views, onViewers }) => (
    <div className="grid lg:grid-cols-5 gap-5">
        <section className="lg:col-span-3 bg-white rounded-2xl border border-oro-300 shadow-xs p-6 sm:p-8">
            <p className="flex items-center gap-2 text-sm font-semibold text-oro-700"><PremiumBadge /> Incluse in SwimIn Premium</p>
            <h2 className="text-2xl font-bold text-abisso mt-2">Scopri chi ti cerca e cosa funziona</h2>
            <ul className="mt-4 space-y-2.5 text-slate-700">
                {['Visite e comparse nelle ricerche, confrontate con il mese prima', 'Chi ti visita: tipo, ruolo e provincia', 'Consigli pratici per farti trovare', 'Reazioni, commenti e ripubblicazioni di ogni post', 'Per le strutture: quante persone aprono ogni annuncio e quante si candidano'].map((t) => (
                    <li key={t} className="flex gap-2.5"><Icon type="check" className="w-5 h-5 text-cloro-700 shrink-0 mt-0.5" /> {t}</li>
                ))}
            </ul>
            <Link to="/premium" className="inline-flex mt-6 px-5 py-2.5 rounded-full font-semibold bg-abisso text-white hover:bg-corsia-900">Scopri Premium</Link>
        </section>
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8">
            <h2 className="text-xl font-bold text-abisso">Visite al profilo</h2>
            <p className="font-display text-5xl font-bold text-abisso mt-3 tabular-nums">{views === null ? '–' : views}</p>
            <p className="text-sm text-slate-500 mt-1">negli ultimi 30 giorni</p>
            {onViewers && <button type="button" onClick={onViewers} className="inline-block mt-4 py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Vedi gli ultimi visitatori</button>}
        </section>
    </div>
);

const EmptyCard: React.FC<{ icon: IconType; title: string; text: string }> = ({ icon, title, text }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 text-center">
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
