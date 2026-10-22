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
import type { EnrichedPost, Job, Application } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';

interface EnrichedHiredApp extends Application {
    job?: Job;
}

const Home: React.FC = () => {
    usePageTitle('Feed');
    const { user, authenticated } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();
    
    const [posts, setPosts] = useState<EnrichedPost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    
    const [latestJobs, setLatestJobs] = useState<Job[]>([]);
    const [isLoadingJobs, setIsLoadingJobs] = useState(true);

    // 💡 STATO DEL GOLDEN TICKET (ONBOARDING)
    const [hiredApps, setHiredApps] = useState<EnrichedHiredApp[]>([]);

    const POSTS_PER_PAGE = 10;

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
            const fetchedPosts = await databaseService.getFeed(user.$id || user.userId, connections, POSTS_PER_PAGE, offset);
            
            if (fetchedPosts.length < POSTS_PER_PAGE) setHasMore(false);
            
            if (append) setPosts(prev => [...prev, ...fetchedPosts]);
            else setPosts(fetchedPosts);
            
        } catch (error) {
            console.error("Errore nel caricamento del feed:", error);
            showToast('Errore nel caricamento del feed', 'error');
        } finally {
            setIsLoading(false);
            setIsFetchingMore(false);
        }
    }, [user, showToast]);

    useEffect(() => {
        if (authenticated && user) loadFeed();
    }, [authenticated, user, loadFeed]);

    useEffect(() => {
        const loadJobs = async () => {
            try {
                const jobs = await databaseService.getActiveJobs();
                setLatestJobs(jobs.slice(0, 3));
            } catch (error) { console.error("Errore caricamento lavori:", error); }
            finally { setIsLoadingJobs(false); }
        };
        loadJobs();
    }, []);

    if (!authenticated || !user) return null;

    return (
        <div className="w-full pt-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            <div className="lg:col-span-8 flex flex-col gap-6">
                
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
                                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">Sei stato assunto! 🎉</h2>
                                    <p className="text-green-50 font-medium text-lg max-w-xl mb-6">
                                        Congratulazioni! <strong>{app.job?.structureName}</strong> ti ha scelto per il ruolo di <em>{app.job?.title}</em>.
                                    </p>
                                    <button onClick={() => navigate(`/profile/${app.job?.structureId}`)} className="bg-white text-green-700 font-extrabold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 outline-none focus-visible:ring-4 focus-visible:ring-green-300">
                                        <Icon type="building" className="w-5 h-5" /> Entra nell'Area Team
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <PostCreator onPostCreated={() => loadFeed(0, false)} />

                <div className="flex flex-col gap-5 relative">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 shadow-sm"></div>
                        </div>
                    ) : posts.length > 0 ? (
                        <>
                            {posts.map(post => (
                                <PostCard
                                    key={post.$id}
                                    post={post}
                                    onSelectPost={(p) => navigate(`/post/${p.$id}`, { state: { post: p } })}
                                    onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.$id !== id))}
                                    onUpdated={(updated) => setPosts((prev) => prev.map((x) => (x.$id === updated.$id ? updated : x)))}
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
                            <h3 className="text-xl font-bold text-slate-800">Il tuo feed è vuoto</h3>
                            <p className="text-slate-500 mt-2 max-w-sm mx-auto">Visita la sezione Network per trovare colleghi o scrivi il tuo primo post!</p>
                            <button onClick={() => navigate('/network')} className="mt-6 bg-blue-600 text-white font-bold px-6 py-2.5 rounded-full hover:bg-blue-700 transition shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                Esplora il Network
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <aside className="hidden lg:block lg:col-span-4">
                <div className="sticky top-24 bg-white rounded-3xl shadow-sm border border-slate-200 p-6 overflow-hidden">
                    <h2 className="text-lg font-extrabold text-slate-800 mb-5 flex items-center gap-2">
                        <Icon type="briefcase" className="w-5 h-5 text-blue-600" /> Ultime Offerte
                    </h2>
                    
                    {isLoadingJobs ? (
                        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600"></div></div>
                    ) : latestJobs.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {latestJobs.map(job => (
                                <div key={job.$id} onClick={() => navigate('/jobs', { state: { selectedJobId: job.$id } })} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-2xl cursor-pointer transition-colors group border border-transparent hover:border-slate-200 outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500" tabIndex={0}>
                                    <img src={job.facilityLogo || initialsAvatar(job.structureName || 'S')} alt="Logo" className="w-10 h-10 rounded-lg bg-slate-50 object-cover border border-slate-100 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors truncate">{job.title}</p>
                                        <p className="text-[11px] text-slate-500 mt-1 truncate">{job.structureName || 'Struttura'} • {job.city}</p>
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => navigate('/jobs')} className="w-full mt-4 py-2.5 px-4 bg-slate-50 text-slate-700 font-bold rounded-xl text-sm hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                                Vedi tutte le offerte
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 font-medium text-center py-4">Nessun nuovo annuncio al momento.</p>
                    )}
                </div>
            </aside>
        </div>
    );
};

export default Home;