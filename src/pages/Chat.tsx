import React from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { MessagesView } from '@/features/messaging/components/MessagesView';

const Chat: React.FC = () => {
    usePageTitle('Messaggi');
    const { user } = useAuth();
    const navigate = useNavigate();

    if (!user) return null;

    const handleProfileClick = (userId: string) => {
        navigate(`/profile/${userId}`);
    };

    return (
        <div className="pt-4 w-full animate-in fade-in duration-500">
            <MessagesView 
                currentUserId={user.$id} 
                onProfileClick={handleProfileClick}
            />
        </div>
    );
};

export default Chat;