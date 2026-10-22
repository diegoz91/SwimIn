import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSaved } from '@/context/SavedContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService } from '@/services/database';
import { PostCard } from '@/features/feed/components/PostCard';
import { PageLoader } from '@/components/common/PageLoader';
import { Icon } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';
import type { EnrichedPost, Job } from '@/types/types';

type Tab = 'post' | 'job';

/** Post e offerte salvati dall'utente (visibili solo a lui). */
const Saved: React.FC = () => {
    usePageTitle('Elementi salvati');
    const { user } = useAuth();
    const { items, toggle } = useSaved();
    const navigate = useNavigate();
    const [tab, setTab] = useState<Tab>('post');
    const [posts, setPosts] = useState<EnrichedPost[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const postIds = items.filter((i) => i.targetType === 'post').map((i) => i.targetId);
    const jobIds = items.filter((i) => i.targetType === 'job').map((i) => i.targetId);
    const key = `${postIds.join(',')}|${jobIds.join(',')}`;

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        Promise.all([databaseService.getPostsByIds(postIds, user.$id), databaseService.getJobsByIds(jobIds)])
            .then(([p, j]) => {
                if (cancelled) return;
                // Manteniamo l'ordine di salvataggio (dal più recente).
                setPosts(postIds.map((id) => p.find((x) => x.$id === id)).filter((x): x is EnrichedPost => !!x));
                setJobs(jobIds.map((id) => j.find((x) => x.$id === id)).filter((x): x is Job => !!x));
            })
            .catch((e) => console.error('Salvati:', e))
            .finally(() => !cancelled && setIsLoading(false));
        return () => {
            cancelled = true;
        };
    }, [key, user]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="pt-4 max-w-2xl mx-auto w-full">
            <h1 className="text-4xl font-bold text-abisso leading-none mb-4">Elementi salvati</h1>
            <div className="inline-flex bg-slate-200/60 p-1 rounded-full mb-5" role="tablist">
                {([['post', `Post (${postIds.length})`], ['job', `Offerte (${jobIds.length})`]] as [Tab, string][]).map(([id, label]) => (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={tab === id}
                        onClick={() => setTab(id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${tab === id ? 'bg-white text-abisso shadow-sm' : 'text-slate-500 hover:text-abisso'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <PageLoader />
            ) : tab === 'post' ? (
                posts.length === 0 ? (
                    <Empty text="Salva un post dal menu “…” per ritrovarlo qui." />
                ) : (
                    <div className="space-y-4">
                        {posts.map((p) => (
                            <PostCard key={p.$id} post={p} onSelectPost={(post) => navigate(`/post/${post.$id}`, { state: { post } })} onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.$id !== id))} />
                        ))}
                    </div>
                )
            ) : jobs.length === 0 ? (
                <Empty text="Salva le offerte che ti interessano dalla bacheca lavoro." />
            ) : (
                <ul className="bg-white rounded-2xl border border-slate-200 shadow-card divide-y divide-slate-100 overflow-hidden">
                    {jobs.map((j) => (
                        <li key={j.$id} className="flex items-center gap-3 px-4 py-3">
                            <button onClick={() => navigate('/jobs', { state: { selectedJobId: j.$id } })} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                                <img src={j.facilityLogo || initialsAvatar(j.structureName)} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-100" />
                                <span className="min-w-0">
                                    <span className="block font-semibold text-abisso truncate">{j.title}</span>
                                    <span className="block text-sm text-slate-500 truncate">
                                        {[j.structureName, j.city].filter(Boolean).join(', ')}{!j.isActive && ' · non più disponibile'}
                                    </span>
                                </span>
                            </button>
                            <button onClick={() => toggle('job', j.$id)} className="p-2 text-corsia-700 hover:bg-piastrella rounded-full" aria-label="Rimuovi dai salvati">
                                <Icon type="bookmark" className="w-5 h-5 fill-corsia-100" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
        <Icon type="bookmark" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
        <p className="text-slate-600">{text}</p>
    </div>
);

export default Saved;
