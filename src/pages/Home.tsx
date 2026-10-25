import React, { useEffect, useState, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { client, databases } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { Query } from 'appwrite';
import { PostCreator } from '@/features/feed/components/PostCreator';
import { PostCard } from '@/features/feed/components/PostCard';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { CertificationAlert, HomeProfileCard, HomeRightRail } from '@/features/feed/components/HomeSidebars';
import type { EnrichedPost, Job, Application } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';
import { useBlocks } from '@/context/BlocksContext';
import { rankForYou, saveFeedMode, savedFeedMode, type FeedMode } from '@/utils/feedRank';
import { scrollPageTo } from '@/utils/scroll';

interface EnrichedHiredApp extends Application {
    job?: Job;
}

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
    
    const [latestJobs, setLatestJobs] = useState<Job[]>([]);
    const [isLoadingJobs, setIsLoadingJobs] = useState(true);

    // 💡 STATO DEL GOLDEN TICKET (ONBOARDING)
    const [hiredApps, setHiredApps] = useState<EnrichedHiredApp[]>([]);

    // "Per te" ordina per rilevanza una finestra più ampia di post; "Più recenti" è cronologico.
    const [feedMode, setFeedMode] = useState<FeedMode>(savedFeedMode);
    const POSTS_PER_PAGE = feedMode === 'perte' ? 30 : 10;

    // Controllo Assunzioni
    useEffect(() => {
        if (!user || user.userType === 'structure') return;
        
        const fetchHiredStatus = async () => {
            try {
                const res = await databases.listDocuments<Application>(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections.applications, [
                    Query.equal('applicantId', user.$id),
                    Query.equal('status', 'hired'),
                    Query.orderDesc('$createdAt')
                ]);
                
                const dismissedIds = JSON.parse(localStorage.getItem('dismissed_hired_banners') || '[]');
                const newApps = res.documents.filter(app => !dismissedIds.includes(app.$id));

                if (newApps.length > 0) {
                    const enriched = await Promise.all(newApps.map(async app => {
                        try {
                            const job = await databases.getDocument<Job>(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections.jobs, app.jobId);
                            return { ...app, job };
                        } catch { return app; }
                    }));
                    setHiredApps(enriched);
                }
            } catch (e) {
                console.warn('Stato assunzioni non disponibile:', e);
            }
        };
        fetchHiredStatus();
    }, [user]);

    const dismissGoldenTicket = (appId: string) => {
        const dismissedIds = JSON.parse(localStorage.getItem('dismissed_hired_banners') || '[]');
        localStorage.setItem('dismissed_hired_banners', JSON.stringify([...dismissedIds, appId]));
        setHiredApps(prev => prev.filter(app => app.$id !== appId));
    };

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

    useEffect(() => {
        if (authenticated && user) loadFeed();
    }, [authenticated, user, loadFeed]);

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
                </div>
            </aside>

            <div className="flex flex-col gap-4 min-w-0">
                <CertificationAlert user={user} />
                
                {/* 💡 IL GOLDEN TICKET! */}
                {hiredApps.length > 0 && (
                    <div className="flex flex-col gap-4">
                        {hiredApps.map(app => (
                            <div key={app.$id} className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 sm:p-8 shadow-lg text-white relative overflow-hidden animate-in zoom-in-95 duration-500">
                                <div className="absolute -right-10 -top-10 opacity-10">
                                    <Icon type="sparkles" className="w-40 h-40" />
                                </div>
                                <button onClick={() => dismissGoldenTicket(app.$id)} className="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/20 p-2 rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-white">
                                    <Icon type="x" className="w-5 h-5" />
                                </button>
                                
                                <div className="relative z-10">
                                    <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm border border-white/30">
                                        <Icon type="check-double" className="w-6 h-6 text-white" />
                                    </div>
                                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">Sei stato assunto</h2>
                                    <p className="text-green-50 font-medium text-lg max-w-xl mb-6">
                                        Congratulazioni! <strong>{app.job?.structureName}</strong> ti ha scelto per il ruolo di <em>{app.job?.title}</em>.
                                    </p>
                                    <button onClick={() => navigate(`/profile/${app.job?.structureId}`)} className="bg-white text-green-700 font-extrabold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 outline-none focus-visible:ring-4 focus-visible:ring-green-300">
                                        <Icon type="building" className="w-5 h-5" /> Entra nell’area staff
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <PostCreator onPostCreated={() => loadFeed(0, false)} />

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