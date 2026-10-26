import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { PostCard } from '@/features/feed/components/PostCard';
import { initialsAvatar } from '@/utils/avatar';
import type { EnrichedPost, Facility, Group, Job, StructureProfile, SwimMeet, UserProfile } from '@/types/types';
import { EventCard } from '@/features/events/EventCard';
import { groupCategoryLabel } from '@/data/groups';
import { jobDisplayTitle } from '@/utils/jobs';
import { useBlocks } from '@/context/BlocksContext';

type Tab = 'tutti' | 'persone' | 'strutture' | 'offerte' | 'gruppi' | 'eventi' | 'post';

interface Results {
    people: UserProfile[];
    structures: (StructureProfile | Facility)[];
    jobs: Job[];
    groups: Group[];
    events: SwimMeet[];
    hashtags: { tag: string; posts: number }[];
    posts: EnrichedPost[];
}

const EMPTY: Results = { people: [], structures: [], jobs: [], groups: [], events: [], hashtags: [], posts: [] };

const nameOf = (p: UserProfile | StructureProfile | Facility) =>
    'userType' in p
        ? p.userType === 'professional'
            ? `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Utente'
            : p.structureName || 'Struttura'
        : p.name;

const ResultRow: React.FC<{ to: string; image: string; title: string; subtitle?: string; square?: boolean }> = ({ to, image, title, subtitle, square }) => (
    <li>
        <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-piastrella outline-none focus-visible:bg-piastrella">
            <img src={image} alt="" className={`w-12 h-12 object-cover flex-shrink-0 border border-slate-100 ${square ? 'rounded-xl' : 'rounded-full'}`} />
            <span className="min-w-0">
                <span className="block font-semibold text-abisso truncate">{title}</span>
                {subtitle && <span className="block text-sm text-slate-500 truncate">{subtitle}</span>}
            </span>
        </Link>
    </li>
);

const Section: React.FC<{ title: string; count: number; onMore?: () => void; children: React.ReactNode }> = ({ title, count, onMore, children }) => (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <h2 className="px-4 pt-4 pb-2 text-xl font-bold text-abisso">{title}</h2>
        {children}
        {onMore && count > 3 && (
            <button onClick={onMore} className="w-full py-3 text-sm font-semibold text-corsia-700 hover:bg-piastrella border-t border-slate-100">
                Mostra tutti ({count})
            </button>
        )}
    </section>
);

const Search: React.FC = () => {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const blocks = useBlocks();
    const q = (params.get('q') || '').trim();
    const [input, setInput] = useState(q);
    const [tab, setTab] = useState<Tab>('tutti');
    const [results, setResults] = useState<Results>(EMPTY);
    const [isLoading, setIsLoading] = useState(false);
    usePageTitle(q ? `Risultati per "${q}"` : 'Cerca');

    useEffect(() => setInput(q), [q]);

    // Risultati mentre si scrive (da 2 lettere), senza dover premere Invio.
    useEffect(() => {
        const next = input.trim();
        if (next === q || (next.length > 0 && next.length < 2)) return;
        const t = window.setTimeout(() => {
            setTab('tutti');
            setParams(next ? { q: next } : {}, { replace: true });
        }, 300);
        return () => window.clearTimeout(t);
    }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!user || q.length < 2) {
            setResults(EMPTY);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        Promise.allSettled([
            databaseService.searchNetwork(q, user.$id),
            databaseService.searchJobs(q),
            databaseService.searchPosts(q, user.$id),
            databaseService.searchGroups(q),
            databaseService.searchEvents(q),
            databaseService.searchHashtags(q),
        ]).then(([network, jobs, posts, groups, events, hashtags]) => {
            if (cancelled) return;
            const net = network.status === 'fulfilled' ? network.value : { profiles: [], facilities: [] };
            setResults({
                people: net.profiles.filter((p): p is UserProfile => p.userType === 'professional' && !blocks.isHidden(p.userId || p.$id)),
                structures: [...net.profiles.filter((p): p is StructureProfile => p.userType === 'structure'), ...net.facilities],
                jobs: jobs.status === 'fulfilled' ? jobs.value : [],
                posts: posts.status === 'fulfilled' ? posts.value.filter((p) => !blocks.isHidden(p.authorId)) : [],
                groups: groups.status === 'fulfilled' ? groups.value : [],
                events: events.status === 'fulfilled' ? events.value.filter((e) => !blocks.isHidden(e.creatorId)) : [],
                hashtags: hashtags.status === 'fulfilled' ? hashtags.value : [],
            });
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [q, user]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setTab('tutti');
        setParams(input.trim() ? { q: input.trim() } : {});
    };

    const total = results.people.length + results.structures.length + results.jobs.length + results.groups.length + results.events.length + results.hashtags.length + results.posts.length;
    const show = (t: Tab) => tab === 'tutti' || tab === t;
    const limit = (n: number) => (tab === 'tutti' ? 3 : n);

    const TABS: { id: Tab; label: string; count: number }[] = [
        { id: 'tutti', label: 'Tutti', count: total },
        { id: 'persone', label: 'Persone', count: results.people.length },
        { id: 'strutture', label: 'Strutture', count: results.structures.length },
        { id: 'offerte', label: 'Offerte', count: results.jobs.length },
        { id: 'gruppi', label: 'Gruppi', count: results.groups.length },
        { id: 'eventi', label: 'Eventi', count: results.events.length },
        { id: 'post', label: 'Post', count: results.posts.length },
    ];

    return (
        <div className="pt-4 max-w-3xl mx-auto w-full">
            <form onSubmit={submit} role="search" className="mb-4">
                <label htmlFor="search-page" className="sr-only">Cerca su SwimIn</label>
                <div className="relative">
                    <Icon type="search" className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        id="search-page"
                        type="search"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Cerca persone, piscine, offerte, gruppi, eventi, #hashtag"
                        autoFocus={!q}
                        className="w-full h-12 pl-12 pr-4 rounded-2xl bg-white border border-slate-200 shadow-card text-abisso focus:border-corsia-300 focus:ring-2 focus:ring-corsia-100 outline-none"
                    />
                </div>
            </form>

            {q.length >= 2 && (
                <div className="flex gap-2 overflow-x-auto pb-3 mb-2 -mx-1 px-1" role="tablist">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={tab === t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition ${
                                tab === t.id ? 'bg-abisso text-white border-abisso' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            {t.label}{!isLoading && t.id !== 'tutti' ? ` · ${t.count}` : ''}
                        </button>
                    ))}
                </div>
            )}

            {q.length < 2 ? (
                <div className="text-center py-16 text-slate-500">
                    <Icon type="search" className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p>Scrivi almeno due lettere: un nome, una città, un ruolo come “istruttore”, una piscina, un gruppo o un #hashtag.</p>
                </div>
            ) : isLoading ? (
                <PageLoader label="Ricerca in corso…" />
            ) : total === 0 ? (
                <div className="text-center py-16">
                    <p className="font-semibold text-abisso">Nessun risultato per “{q}”.</p>
                    <p className="text-sm text-slate-500 mt-1">Prova con un termine più breve o controlla l'ortografia.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {tab === 'tutti' && results.hashtags.length > 0 && (
                        <ul className="flex flex-wrap gap-2" aria-label="Hashtag">
                            {results.hashtags.map((h) => (
                                <li key={h.tag}>
                                    <Link to={`/hashtag/${encodeURIComponent(h.tag)}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-slate-200 text-sm font-semibold text-corsia-700 hover:border-corsia-300">
                                        <Icon type="hashtag" className="w-4 h-4" /> {h.tag}
                                        <span className="text-slate-500 font-normal">{h.posts === 1 ? '1 post' : `${h.posts} post`}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    {show('persone') && results.people.length > 0 && (
                        <Section title="Persone" count={results.people.length} onMore={() => setTab('persone')}>
                            <ul className="divide-y divide-slate-100">
                                {results.people.slice(0, limit(50)).map((p) => (
                                    <ResultRow key={p.$id} to={`/profile/${p.$id}`} image={p.avatar || initialsAvatar(nameOf(p))} title={nameOf(p)} subtitle={[p.title, p.city].filter(Boolean).join(' – ')} />
                                ))}
                            </ul>
                        </Section>
                    )}
                    {show('strutture') && results.structures.length > 0 && (
                        <Section title="Strutture" count={results.structures.length} onMore={() => setTab('strutture')}>
                            <ul className="divide-y divide-slate-100">
                                {results.structures.slice(0, limit(50)).map((s) => (
                                    <ResultRow
                                        key={s.$id}
                                        to={`/profile/${s.$id}`}
                                        image={s.logo || initialsAvatar(nameOf(s))}
                                        title={nameOf(s)}
                                        subtitle={['userType' in s ? s.structureType : s.type, s.city].filter(Boolean).join(' – ')}
                                        square
                                    />
                                ))}
                            </ul>
                        </Section>
                    )}
                    {show('offerte') && results.jobs.length > 0 && (
                        <Section title="Offerte di lavoro" count={results.jobs.length} onMore={() => setTab('offerte')}>
                            <ul className="divide-y divide-slate-100">
                                {results.jobs.slice(0, limit(50)).map((j) => (
                                    <li key={j.$id}>
                                        <button
                                            onClick={() => navigate('/jobs', { state: { selectedJobId: j.$id } })}
                                            className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-piastrella"
                                        >
                                            <img src={j.facilityLogo || initialsAvatar(j.structureName)} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-100" />
                                            <span className="min-w-0">
                                                <span className="block font-semibold text-abisso truncate">{j.isSOS ? 'SOS – ' : ''}{jobDisplayTitle(j)}</span>
                                                <span className="block text-sm text-slate-500 truncate">{[j.structureName, j.city].filter(Boolean).join(' – ')}</span>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}
                    {show('gruppi') && results.groups.length > 0 && (
                        <Section title="Gruppi" count={results.groups.length} onMore={() => setTab('gruppi')}>
                            <ul className="divide-y divide-slate-100">
                                {results.groups.slice(0, limit(50)).map((g) => (
                                    <ResultRow
                                        key={g.$id}
                                        to={`/gruppi/${g.$id}`}
                                        image={g.cover || initialsAvatar(g.name)}
                                        title={g.name}
                                        subtitle={[groupCategoryLabel(g.category), g.membersCount === 1 ? '1 membro' : `${g.membersCount || 0} membri`].join(' – ')}
                                        square
                                    />
                                ))}
                            </ul>
                        </Section>
                    )}
                    {show('eventi') && results.events.length > 0 && (
                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-abisso px-1">Eventi</h2>
                            <ul className="grid sm:grid-cols-2 gap-3">
                                {results.events.slice(0, limit(50)).map((e) => <li key={e.$id} className="min-w-0"><EventCard event={e} currentUserId={user?.$id} /></li>)}
                            </ul>
                            {tab === 'tutti' && results.events.length > 3 && (
                                <button onClick={() => setTab('eventi')} className="w-full py-3 text-sm font-semibold text-corsia-700 bg-white rounded-2xl border border-slate-200">Mostra tutti gli eventi ({results.events.length})</button>
                            )}
                        </section>
                    )}
                    {show('post') && results.posts.length > 0 && (
                        <div className="space-y-4">
                            {tab === 'tutti' && <h2 className="text-xl font-bold text-abisso px-1">Post</h2>}
                            {results.posts.slice(0, limit(20)).map((p) => (
                                <PostCard key={p.$id} post={p} onSelectPost={(post) => navigate(`/post/${post.$id}`, { state: { post } })} />
                            ))}
                            {tab === 'tutti' && results.posts.length > 3 && (
                                <button onClick={() => setTab('post')} className="w-full py-3 text-sm font-semibold text-corsia-700 bg-white rounded-2xl border border-slate-200">
                                    Mostra tutti i post ({results.posts.length})
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Search;
