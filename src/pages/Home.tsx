import React, { useEffect, useState, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useLiveCollection } from '@/hooks/useLiveCollection';
import { PostCreator } from '@/features/feed/components/PostCreator';
import { PostCard } from '@/features/feed/components/PostCard';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { CertificationAlert, HomeProfileCard, HomeRightRail } from '@/features/feed/components/HomeSidebars';
import type { EnrichedPost, Job } from '@/types/types';
import { HiredBanner } from '@/features/jobs/components/HiredBanner';
import { MyWorkplaces } from '@/features/team/MyWorkplaces';
import { useBlocks } from '@/context/BlocksContext';
import { rankForYou, saveFeedMode, savedFeedMode, type FeedMode } from '@/utils/feedRank';
import { scrollPageTo } from '@/utils/scroll';

const Home: React.FC = () => {
    usePageTitle('Feed');
    const { user, authenticated } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();
    
    const [posts, setPosts] = useState<EnrichedPost[]>([]);
    const blocks = useBlocks();
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [newPosts, setNewPosts] = useState(0);
    
    const [latestJobs, setLatestJobs] = useState<Job[]>([]);
    const [isLoadingJobs, setIsLoadingJobs] = useState(true);

    // "Per te" ordina per rilevanza una finestra più ampia di post; "Più recenti" è cronologico.
    const [feedMode, setFeedMode] = useState<FeedMode>(savedFeedMode);
    const POSTS_PER_PAGE = feedMode === 'perte' ? 30 : 10;

    const loadFeed = useCallback(async (offset = 0, append = false) => {
        if (!user) return;
        if (offset === 0) setIsLoading(true);
        else setIsFetchingMore(true);

        try {
            const connections = user.connections || [];
            const following = await databaseService.getFollowingIds(user.$id).catch(() => [] as string[]);
            const raw = await databaseService.getFeed(user.$id || user.userId, connections, POSTS_PER_PAGE, offset, following);
            const fetchedPosts = feedMode === 'perte' ? rankForYou(raw, { me: user.$id, connections: new Set(connections), following: new Set(following) }) : raw;

            setHasMore(raw.length >= POSTS_PER_PAGE);
            
            if (append) setPosts(prev => [...prev, ...fetchedPosts]);
            else setPosts(fetchedPosts);
            
        } catch (error) {
            console.error("Errore nel caricamento del feed:", error);
            showToast('Errore nel caricamento del feed', 'error');
        } finally {
            setIsLoading(false);
            setIsFetchingMore(false);
        }
    }, [user, showToast, feedMode, POSTS_PER_PAGE]);

    // Si ricarica solo se cambiano persona, collegamenti o ordine, non a ogni aggiornamento del profilo.
    const feedKey = user ? `${user.$id}|${(user.connections || []).join(',')}|${feedMode}` : '';
    const loadFeedRef = React.useRef(loadFeed);
    loadFeedRef.current = loadFeed;
    useEffect(() => {
        if (authenticated && feedKey) { setNewPosts(0); void loadFeedRef.current(); }
    }, [authenticated, feedKey]);

    // Tempo reale: reazioni, commenti e modifiche aggiornano i post visibili; i post nuovi di
    // altre persone non spostano il feed mentre leggi, ma compaiono come avviso in alto.
    useLiveCollection('posts', (changes) => {
        const patch = new Map<string, Record<string, unknown>>();
        const removed = new Set<string>();
        let fresh = 0;
        for (const c of changes) {
            if (c.type === 'delete') removed.add(c.id);
            else if (c.type === 'update') patch.set(c.id, c.payload);
            else if (c.payload.authorId !== user?.$id && !c.payload.groupId && !blocks.isMutedOrHidden(String(c.payload.authorId))) fresh += 1;
        }
        if (patch.size || removed.size) {
            setPosts((prev) =>
                prev
                    .filter((p) => !removed.has(p.$id))
                    .map((p) => {
                        const u = patch.get(p.$id);
                        if (!u) return p;
                        const { likesCount, commentsCount, reactionCounts, repostsCount, pollCounts, content, media, editedAt } = u as Partial<EnrichedPost>;
                        return { ...p, likesCount: likesCount ?? p.likesCount, commentsCount: commentsCount ?? p.commentsCount, reactionCounts: reactionCounts ?? p.reactionCounts, repostsCount: repostsCount ?? p.repostsCount, pollCounts: pollCounts ?? p.pollCounts, content: content ?? p.content, media: media ?? p.media, editedAt: editedAt ?? p.editedAt };
                    })
            );
        }
        if (fresh) setNewPosts((n) => n + fresh);
    });
    const showNewPosts = () => {
        setNewPosts(0);
        scrollPageTo(0, true);
        void loadFeed(0, false);
    };

    useEffect(() => {
        const loadJobs = async () => {
            try {
                const jobs = await databaseService.getActiveJobs();
                setLatestJobs(jobs.slice(0, 4));
            } catch (error) { console.error("Errore caricamento lavori:", error); }
            finally { setIsLoadingJobs(false); }
        };
        loadJobs();
    }, []);

    if (!authenticated || !user) return null;

    return (
        <div className="w-full pt-4 grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_18rem] xl:grid-cols-[16rem_minmax(0,1fr)_20rem] gap-6">

            <aside className="hidden lg:block" aria-label="Il tuo profilo">
                <div className="sticky top-6">
                    <HomeProfileCard user={user} />
                    <div className="mt-4">
                        <MyWorkplaces variant="card" />
                    </div>
                </div>
            </aside>

            <div className="flex flex-col gap-4 min-w-0">
                <CertificationAlert user={user} />
                
                <HiredBanner user={user} />
                <div className="lg:hidden">
                    <MyWorkplaces variant="strip" />
                </div>

                <PostCreator onPostCreated={() => { setNewPosts(0); void loadFeed(0, false); }} />

                <div className="flex items-center gap-3" role="group" aria-label="Ordine del feed">
                    <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                    {(['perte', 'recenti'] as FeedMode[]).map((m) => (
                        <button
                            key={m}
                            onClick={() => { setFeedMode(m); saveFeedMode(m); }}
                            aria-pressed={feedMode === m}
                            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${feedMode === m ? 'bg-abisso text-white' : 'text-slate-500 hover:text-abisso hover:bg-white'}`}
                        >
                            {m === 'perte' ? 'Per te' : 'Più recenti'}
                        </button>
                    ))}
                </div>

                <div className="flex flex-col gap-4 relative">
                    {newPosts > 0 && !isLoading && (
                        <div className="sticky top-4 z-10 flex justify-center pointer-events-none -mb-2">
                            <button
                                type="button"
                                onClick={showNewPosts}
                                className="pointer-events-auto inline-flex items-center gap-2 bg-corsia-600 text-white text-sm font-semibold rounded-full pl-3 pr-4 py-2 shadow-lg hover:bg-corsia-700 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-corsia-500 outline-none"
                            >
                                <Icon type="arrow-up" className="w-4 h-4" />
                                {newPosts === 1 ? '1 nuovo post' : `${newPosts} nuovi post`}
                            </button>
                        </div>
                    )}
                    {isLoading ? (
                        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Caricamento del feed">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                                    <div className="flex gap-3 items-center">
                                        <div className="w-12 h-12 rounded-full bg-slate-100" />
                                        <div className="flex-1 space-y-2"><div className="h-3 bg-slate-100 rounded w-1/3" /><div className="h-3 bg-slate-100 rounded w-1/4" /></div>
                                    </div>
                                    <div className="mt-5 space-y-2"><div className="h-3 bg-slate-100 rounded" /><div className="h-3 bg-slate-100 rounded w-5/6" /><div className="h-3 bg-slate-100 rounded w-2/3" /></div>
                                </div>
                            ))}
                        </div>
                    ) : posts.length > 0 ? (
                        <>
                            {posts.filter((post) => !blocks.isMutedOrHidden(post.authorId)).map(post => (
                                <PostCard
                                    key={post.$id}
                                    post={post}
                                    onSelectPost={(p) => navigate(`/post/${p.$id}`, { state: { post: p } })}
                                    onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.$id !== id))}
                                    onUpdated={(updated) => setPosts((prev) => prev.map((x) => (x.$id === updated.$id ? updated : x)))}
                                    onReposted={(created) => { setPosts((prev) => [created, ...prev]); scrollPageTo(0, true); }}
                                />
                            ))}
                            {hasMore && (
                                <button 
                                    onClick={() => loadFeed(posts.length, true)} 
                                    disabled={isFetchingMore}
                                    className="w-full py-4 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-blue-100 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    {isFetchingMore ? 'Caricamento...' : 'Mostra altri post'}
                                </button>
                            )}
                        </>
                    ) : (
                        <div className="bg-white rounded-3xl p-10 text-center shadow-sm border border-slate-200">
                            <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                <Icon type="globe" className="w-10 h-10 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Il tuo feed è ancora vuoto</h3>
                            <p className="text-slate-500 mt-2 max-w-sm mx-auto">Collegati con colleghi e piscine per vedere qui i loro aggiornamenti, oppure pubblica il tuo primo post.</p>
                            <button onClick={() => navigate('/network')} className="mt-6 bg-blue-600 text-white font-bold px-6 py-2.5 rounded-full hover:bg-blue-700 transition shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                Trova colleghi
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <aside className="hidden lg:block" aria-label="Suggerimenti">
                <div className="sticky top-6">
                    <HomeRightRail user={user} jobs={latestJobs} isLoadingJobs={isLoadingJobs} />
                </div>
            </aside>
        </div>
    );
};

export default Home;