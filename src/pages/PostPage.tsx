import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { PostDetailView } from '@/features/feed/components/PostDetailView';
import { PageLoader } from '@/components/common/PageLoader';
import { databaseService } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { EnrichedPost } from '@/types/types';

/** Pagina di un singolo post (/post/:id): apribile da link condivisi e notifiche. */
const PostPage: React.FC = () => {
    usePageTitle('Post');
    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const statePost = (location.state as { post?: EnrichedPost } | null)?.post;

    const [post, setPost] = useState<EnrichedPost | null>(statePost && statePost.$id === id ? statePost : null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id || (post && post.$id === id)) return;
        let cancelled = false;
        databaseService
            .getPost(id, user?.$id)
            .then((p) => !cancelled && setPost(p))
            .catch(() => !cancelled && setNotFound(true));
        return () => {
            cancelled = true;
        };
    }, [id, post, user?.$id]);

    // Arrivati da un link esterno non c'è una pagina precedente nell'app: torniamo al feed.
    const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'));

    if (notFound) {
        return (
            <div className="max-w-xl mx-auto text-center py-20">
                <h1 className="text-xl font-bold text-abisso">Post non disponibile</h1>
                <p className="text-slate-600 mt-2 mb-6">Potrebbe essere stato eliminato dal suo autore.</p>
                <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-700">
                    Torna al feed
                </button>
            </div>
        );
    }
    if (!post) return <PageLoader variant="detail" />;

    return (
        <div className="pt-4 w-full">
            <PostDetailView
                post={post}
                onBack={goBack}
                backLabel="Indietro"
                onSelectProfile={(profileId) => navigate(`/profile/${profileId}`)}
                onDeleted={() => navigate('/', { replace: true })}
                onUpdated={setPost}
            />
        </div>
    );
};

export default PostPage;
