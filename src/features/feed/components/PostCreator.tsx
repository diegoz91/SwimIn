import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { CreatePostModal } from './CreatePostModal';
import type { Media, Post } from '@/types/types';
import { serializeMedia } from '@/utils/postMedia';
import { initialsAvatar } from '@/utils/avatar';
import { displayNameOf } from '@/utils/profile';

interface PostCreatorProps {
    onPostCreated: () => void;
    /** Pubblica nel gruppo indicato invece che nel feed. */
    groupId?: string;
    placeholder?: string;
}

export const PostCreator: React.FC<PostCreatorProps> = ({ onPostCreated, groupId, placeholder = 'Di cosa vorresti parlare alla rete di SwimIn?' }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [initialMediaType, setInitialMediaType] = useState<'photo' | 'video' | 'video-analysis' | null>(null);

    if (!user) return null;

    const displayAvatar = user.userType === 'professional' ? user.avatar : user.logo;
    const defaultAvatar = initialsAvatar(displayNameOf(user));

    const handleOpenModal = (type: 'photo' | 'video' | 'video-analysis' | null = null) => {
        setInitialMediaType(type);
        setIsModalOpen(true);
    };

    const handleCreatePost = async (content: string, media: Media[], category: string, mode?: 'photo' | 'video' | 'video-analysis' | null, poll?: { options: string[]; days: number } | null) => {
        const finalContent = content.trim();

        let pType: Post['postType'] = 'text';
        if (mode === 'video-analysis' && media.length > 0) {
            pType = 'video-analysis';
        } else if (media.length > 0) {
            pType = media.some(m => m.type === 'video') ? 'video' : 'image';
        }

        await databaseService.createPost({
            content: finalContent,
            media: serializeMedia(media),
            postType: pType,
            category,
            poll: poll || null,
            groupId: groupId || null,
        });
        
        onPostCreated();
        setIsModalOpen(false);
        setInitialMediaType(null);
    };

    return (
        <>
            <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-4 sm:p-5">
                <div className="flex gap-3 items-center">
                    <img 
                        src={displayAvatar || defaultAvatar} 
                        alt="Il tuo profilo" 
                        className="w-12 h-12 rounded-full object-cover border border-slate-100 bg-slate-50 shrink-0"
                    />
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 font-medium text-left px-4 py-3 sm:py-3.5 rounded-full transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {placeholder}
                    </button>
                </div>
                
                {/* PULSANTIERA CON VIDEO ANALISI */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <button onClick={() => handleOpenModal('photo')} className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 px-2 sm:px-3 py-2.5 rounded-xl transition-colors flex-1">
                        <Icon type="photo" className="w-5 h-5 text-corsia-500" /> <span className="sr-only sm:not-sr-only">Foto</span>
                    </button>
                    
                    <button onClick={() => handleOpenModal('video')} className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 px-2 sm:px-3 py-2.5 rounded-xl transition-colors flex-1">
                        <Icon type="video" className="w-5 h-5 text-cloro-600" /> <span className="sr-only sm:not-sr-only">Video</span>
                    </button>

                    {/* TASTO VIDEO ANALISI */}
                    <button onClick={() => handleOpenModal('video-analysis')} className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 px-2 sm:px-3 py-2.5 rounded-xl transition-colors flex-1 relative">
                        <Icon type="camera" className="w-5 h-5 text-purple-500" /> 
                        <span className="sr-only sm:not-sr-only whitespace-nowrap">Analisi</span>
                    </button>

                    {!groupId && <button onClick={() => navigate('/jobs')} className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 px-2 sm:px-3 py-2.5 rounded-xl transition-colors flex-1">
                        <Icon type="briefcase" className="w-5 h-5 text-amber-600" /> <span className="sr-only sm:not-sr-only">Offerte</span>
                    </button>}
                </div>
            </div>

            {isModalOpen && (
                <CreatePostModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onCreatePost={handleCreatePost}
                    user={user}
                    initialMediaType={initialMediaType}
                />
            )}
        </>
    );
};