import React from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { MessagesView } from '@/features/messaging/components/MessagesView';

const Chat: React.FC = () => {
    usePageTitle('Messaggi');
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [params] = useSearchParams();
    // Conversazione da aprire: dal pulsante "Messaggio" (state) o da una notifica push (?u=).
    const startWith = (location.state as { startChatWithUserId?: string } | null)?.startChatWithUserId || params.get('u');

    if (!user) return null;

    const handleProfileClick = (userId: string) => {
        navigate(`/profile/${userId}`);
    };

    return (
        <div className="pt-4 w-full animate-in fade-in duration-500">
            <MessagesView 
                currentUserId={user.$id}
                startChatWithUserId={startWith}
                onProfileClick={handleProfileClick}
            />
        </div>
    );
};

export default Chat;