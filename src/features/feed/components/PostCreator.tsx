import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { CreatePostModal } from './CreatePostModal';
import type { Media, Post } from '@/types/types';
import { serializeMedia } from '@/utils/postMedia';

interface PostCreatorProps {
    onPostCreated: () => void;
}

export const PostCreator: React.FC<PostCreatorProps> = ({ onPostCreated }) => {
    const { user } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [initialMediaType, setInitialMediaType] = useState<'photo' | 'video' | 'video-analysis' | null>(null);

    if (!user) return null;

    const displayAvatar = user.userType === 'professional' ? user.avatar : user.logo;
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.firstName || user.structureName || 'User')}&background=eff6ff&color=1d4ed8`;

    const handleOpenModal = (type: 'photo' | 'video' | 'video-analysis' | null = null) => {
        setInitialMediaType(type);
        setIsModalOpen(true);
    };

    const handleCreatePost = async (content: string, media: Media[], category: string, mode?: 'photo' | 'video' | 'video-analysis' | null) => {
        const finalContent = content.trim();

        let pType: Post['postType'] = 'text';
        if (mode === 'video-analysis' && media.length > 0) {
            pType = 'video-analysis';
        } else if (media.length > 0) {
            pType = media.some(m => m.type === 'video') ? 'video' : 'image';
        }

        await databaseService.createPost({
            authorId: user.$id,
            authorType: user.userType,
            content: finalContent,
            media: serializeMedia(media),
            postType: pType,
            category: category, 
            visibility: 'public',
            likesCount: 0,
            commentsCount: 0
        });
        
        onPostCreated();
        setIsModalOpen(false);
        setInitialMediaType(null);
    };

    return (
        <>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 mb-6">
                <div className="flex gap-3 items-center">
                    <img 
                        src={displayAvatar || defaultAvatar} 
                        alt="Tuo Profilo" 
                        className="w-12 h-12 rounded-full object-cover border border-slate-100 bg-slate-50 flex-shrink-0"
                    />
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 font-medium text-left px-4 py-3 sm:py-3.5 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        Di cosa vorresti parlare alla rete di SwimIn?
                    </button>
                </div>
                
                {/* PULSANTIERA CON VIDEO ANALISI */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <button onClick={() => handleOpenModal('photo')} className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 px-2 sm:px-4 py-2.5 rounded-xl transition-colors flex-1">
                        <Icon type="photo" className="w-5 h-5 text-blue-500" /> <span className="hidden sm:inline">Foto</span>
                    </button>
                    
                    <button onClick={() => handleOpenModal('video')} className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 px-2 sm:px-4 py-2.5 rounded-xl transition-colors flex-1">
                        <Icon type="video" className="w-5 h-5 text-green-500" /> <span className="hidden sm:inline">Video</span>
                    </button>

                    {/* TASTO VIDEO ANALISI */}
                    <button onClick={() => handleOpenModal('video-analysis')} className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 px-2 sm:px-4 py-2.5 rounded-xl transition-colors flex-1 relative">
                        <Icon type="camera" className="w-5 h-5 text-purple-500" /> 
                        <span className="hidden sm:inline">Analisi</span>
                        <span className="absolute top-1 right-2 sm:right-6 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                        </span>
                    </button>

                    <button onClick={() => handleOpenModal()} className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 px-2 sm:px-4 py-2.5 rounded-xl transition-colors flex-1">
                        <Icon type="briefcase" className="w-5 h-5 text-amber-500" /> <span className="hidden sm:inline">Lavoro</span>
                    </button>
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