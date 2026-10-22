import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import type { EnrichedPost, UserProfile, StructureProfile, Media } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { LikesModal } from './LikesModal';
import { getPostContent } from '@/utils/postMedia';

interface PostCardProps {
    post: EnrichedPost;
    onSelectPost?: (post: EnrichedPost) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onSelectPost }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [likes, setLikes] = useState(post.likesCount || 0);
    const [isLiking, setIsLiking] = useState(false);
    const [likeAnimation, setLikeAnimation] = useState(false);
    const [isLikesModalOpen, setIsLikesModalOpen] = useState(false);
    const [author, setAuthor] = useState<UserProfile | StructureProfile | null>(null);

    useEffect(() => {
        let isMounted = true;
        databaseService.getProfile(post.authorId).then(profile => {
            if (isMounted) setAuthor(profile);
        }).catch(() => {});
        return () => { isMounted = false; };
    }, [post.authorId]);

    const formattedDate = new Date(post.$createdAt).toLocaleDateString('it-IT', { 
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
    });

    const handleLike = async () => {
        if (!user || isLiking) return;
        setIsLiking(true);
        setLikeAnimation(true);
        setTimeout(() => setLikeAnimation(false), 400);
        
        try {
            const { likesCount } = await databaseService.toggleLike(post.$id, user.$id);
            setLikes(likesCount);
        } catch (error) {
            console.error('toggleLike:', error);
        } finally {
            setIsLiking(false);
        }
    };

    const { text: displayContent, media: extractedMedia } = getPostContent(post);

    const authorName = author ? (author.userType === 'professional' ? `${(author as UserProfile).firstName || ''} ${(author as UserProfile).lastName || ''}`.trim() : (author as StructureProfile).structureName) : 'Membro di SwimIn';
    const authorSubtitle = author ? (author.userType === 'professional' ? (author as UserProfile).title : (author as StructureProfile).structureType) : '';
    const authorAvatar = author ? (author.userType === 'professional' ? (author as UserProfile).avatar : (author as StructureProfile).logo) : '';
    const displayAvatar = authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName || 'U')}&background=eff6ff&color=1d4ed8`;

    // SMART BADGES
    const getSwimBadges = () => {
        if (!author || author.userType !== 'professional' || !(author as UserProfile).certificationsList) return [];
        const str = JSON.stringify((author as UserProfile).certificationsList).toLowerCase();
        const badges = [];
        if (str.includes('fin') || str.includes('federazione')) badges.push({ id: 'fin', text: 'FIN', style: 'bg-orange-100 text-orange-700 border-orange-200' });
        if (str.includes('salvamento') || str.includes('sns') || str.includes('bagnanti')) badges.push({ id: 'salvamento', text: 'Salvamento', style: 'bg-red-100 text-red-700 border-red-200' });
        return badges.slice(0, 2);
    };

    // CATEGORIE VISIVE
    const getCategoryStyles = (cat?: string) => {
        switch(cat) {
            case 'allenamento': return { icon: 'clock', text: 'Allenamento', style: 'bg-blue-50 text-blue-600 border-blue-200' };
            case 'gara': return { icon: 'star', text: 'Gara & Risultati', style: 'bg-amber-50 text-amber-600 border-amber-200' };
            case 'tecnica': return { icon: 'certificate', text: 'Tecnica & Formazione', style: 'bg-purple-50 text-purple-600 border-purple-200' };
            case 'normative': return { icon: 'info', text: 'Normative & Sicurezza', style: 'bg-red-50 text-red-600 border-red-200' };
            default: return null;
        }
    };
    const catStyle = getCategoryStyles(post.category);

    const isVideoAnalysis = post.postType === 'video-analysis' && extractedMedia.length > 0;

    return (
        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-4 overflow-hidden animate-in fade-in duration-300">
            
            {/* Banner Consigliato */}
            {post.recommendedBy && (
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Icon type="thumb-up" className="w-3.5 h-3.5 text-blue-500" />
                    <span 
                        className="cursor-pointer hover:text-blue-600 hover:underline transition-colors" 
                        onClick={() => navigate(`/profile/${post.recommendedBy!.id}`)}
                    >
                        {post.recommendedBy.name}
                    </span> ha consigliato questo post
                </div>
            )}

            <div className="p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-4">
                    <img 
                        src={displayAvatar} 
                        alt={authorName} 
                        className="w-12 h-12 rounded-full object-cover border border-slate-100 cursor-pointer hover:opacity-80 transition-opacity" 
                        onClick={() => navigate(`/profile/${post.authorId}`)}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 
                                onClick={() => navigate(`/profile/${post.authorId}`)}
                                className="font-bold text-slate-900 leading-tight hover:text-blue-600 cursor-pointer transition-colors truncate"
                            >
                                {authorName}
                            </h3>
                            {/* Badge Automatici Istruttore */}
                            {getSwimBadges().map(b => (
                                <span key={b.id} className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${b.style}`}>{b.text}</span>
                            ))}
                        </div>
                        {authorSubtitle && <p className="text-xs text-slate-500 mt-0.5 font-medium truncate">{authorSubtitle}</p>}
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                <Icon type="globe" className="w-3 h-3" /> {formattedDate}
                            </p>
                            {catStyle && (
                                <>
                                    <span className="text-slate-300 text-[10px]">•</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${catStyle.style}`}>
                                        <Icon type={catStyle.icon as any} className="w-3 h-3" /> {catStyle.text}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <p 
                    className={`text-slate-800 whitespace-pre-wrap leading-relaxed text-[15px] ${extractedMedia.length > 0 ? 'mb-3' : ''}`}
                    onClick={() => onSelectPost && onSelectPost(post)}
                >
                    {displayContent}
                </p>

                {extractedMedia.length > 0 && (
                    <div 
                        className={`grid gap-1 rounded-xl overflow-hidden cursor-pointer relative ${extractedMedia.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
                        onClick={() => onSelectPost && onSelectPost(post)}
                    >
                        {/* VIDEO ANALISI */}
                        {isVideoAnalysis && (
                            <div className="absolute inset-0 bg-gradient-to-t from-purple-900/80 via-transparent to-transparent z-10 flex items-end p-4">
                                <div className="bg-purple-600/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg border border-purple-400 shadow-lg flex items-center gap-2">
                                    <Icon type="camera" className="w-5 h-5 animate-pulse" />
                                    <span className="font-extrabold text-sm uppercase tracking-wider">Video-Analisi Tecnica</span>
                                </div>
                            </div>
                        )}

                        {extractedMedia.map((m, idx) => (
                            <img key={idx} src={m.url} alt={m.alt || 'Media'} className="w-full h-auto max-h-[400px] object-cover border border-slate-100" loading="lazy" />
                        ))}
                    </div>
                )}

                {(likes > 0 || post.commentsCount > 0) && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                        {likes > 0 ? (
                            <span onClick={() => setIsLikesModalOpen(true)} className="cursor-pointer hover:text-blue-600 hover:underline flex items-center gap-1.5">
                                <div className="bg-blue-100 p-1 rounded-full"><Icon type="thumb-up" className="w-3 h-3 text-blue-600"/></div>
                                {likes} Consigli
                            </span>
                        ) : <span></span>}
                        {post.commentsCount > 0 && (
                            <span onClick={() => onSelectPost && onSelectPost(post)} className="cursor-pointer hover:text-blue-600 hover:underline">
                                {post.commentsCount} Commenti
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="px-2 py-2 bg-slate-50 border-t border-slate-200 flex justify-around">
                <button 
                    onClick={handleLike}
                    disabled={isLiking}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold hover:bg-slate-200 rounded-lg transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${likeAnimation ? 'scale-110 text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
                >
                    <Icon type="thumb-up" className="w-5 h-5" /> Consiglia
                </button>
                <button 
                    onClick={() => onSelectPost && onSelectPost(post)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-colors active:scale-95 outline-none ${isVideoAnalysis ? 'text-purple-600 hover:bg-purple-100' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
                >
                    <Icon type="chat-bubble" className="w-5 h-5" /> 
                    {isVideoAnalysis ? 'Analizza Video' : 'Commenta'}
                </button>
            </div>
            
            {isLikesModalOpen && (
                <LikesModal postId={post.$id} onClose={() => setIsLikesModalOpen(false)} onNavigate={(view, id) => navigate(`/${view}/${id}`)} />
            )}
        </article>
    );
};