import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { useBlocks } from '@/context/BlocksContext';
import { databaseService } from '@/services/database';
import { PostCard } from '@/features/feed/components/PostCard';
import { Icon } from '@/components/ui/Icon';
import type { EnrichedPost } from '@/types/types';

/** Tutti i post con un #hashtag, dal più recente. */
const Hashtag: React.FC = () => {
    const { tag = '' } = useParams();
    const clean = decodeURIComponent(tag).toLocaleLowerCase('it-IT');
    usePageTitle(`#${clean}`);
    const { user } = useAuth();
    const blocks = useBlocks();
    const navigate = useNavigate();
    const [posts, setPosts] = useState<EnrichedPost[] | null>(null);

    useEffect(() => {
        if (!user) return;
        let alive = true;
        setPosts(null);
        databaseService
            .getPostsByHashtag(clean, user.$id)
            .then((p) => alive && setPosts(p))
            .catch((err) => { console.error('Hashtag:', err); if (alive) setPosts([]); });
        return () => { alive = false; };
    }, [clean, user]);

    const shown = (posts || []).filter((p) => !blocks.isMutedOrHidden(p.authorId));

    return (
        <div className="pt-4 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-3 mb-5">
                <span className="w-12 h-12 rounded-2xl bg-corsia-50 text-corsia-700 grid place-items-center"><Icon type="hashtag" className="w-6 h-6" /></span>
                <div>
                    <h1 className="text-4xl font-bold text-abisso leading-none break-all">#{clean}</h1>
                    {posts && <p className="text-sm text-slate-500 mt-1">{shown.length === 1 ? '1 post' : `${shown.length} post`}</p>}
                </div>
            </div>
            {posts === null ? (
                <div className="space-y-4" aria-hidden="true">{[0, 1].map((i) => <div key={i} className="h-48 bg-white border border-slate-200 rounded-2xl animate-pulse" />)}</div>
            ) : shown.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                    <p className="font-semibold text-abisso">Ancora nessun post con #{clean}.</p>
                    <p className="text-sm text-slate-500 mt-1">Scrivi tu il primo: basta aggiungere #{clean} al testo.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {shown.map((p) => (
                        <PostCard key={p.$id} post={p} onSelectPost={(post) => navigate(`/post/${post.$id}`, { state: { post } })} onDeleted={(id) => setPosts((prev) => (prev || []).filter((x) => x.$id !== id))} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default Hashtag;
