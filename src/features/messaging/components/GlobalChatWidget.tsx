import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Query } from 'appwrite';
import { ChatWindow } from './ChatWindow';
import { ConversationListItem } from './ConversationListItem';
import { databaseService } from '@/services/database'; 
import { databases, client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import type { UserProfile, StructureProfile, Message } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { initialsAvatar } from '@/utils/avatar';

interface Conversation {
  conversationId: string;
  participant: UserProfile | StructureProfile;
  lastMessage: { content: string; sentAt: string; senderId: string; };
  unreadCount: number;
  isParticipantTyping?: boolean;
}

export const GlobalChatWidget: React.FC = () => {
  const { user, authenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isHidden = !authenticated || location.pathname.startsWith('/messages');

  // HEARTBEAT DI PRESENZA
  useEffect(() => {
    if (!user?.$id) return;
    
    databaseService.updatePresence(user.$id, true);

    const handleBeforeUnload = () => {
        databaseService.updatePresence(user.$id, false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        databaseService.updatePresence(user.$id, false);
    };
  }, [user?.$id]);

  const loadConversations = useCallback(async () => {
    if (!user?.$id) return;
    try {
      setIsLoading(true);
      
      // 💡 FILTRO DI RETE: Carichiamo solo i collegamenti reali dell'utente
      const safeConnections = (user.connections || []).slice(0, 100);
      let initialConvs: Conversation[] = [];

      if (safeConnections.length > 0) {
          const res = await databases.listDocuments<UserProfile | StructureProfile>(
              APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections.profiles,
              [Query.equal('$id', safeConnections), Query.limit(100)]
          );
          
          initialConvs = res.documents.map(profile => ({
              conversationId: [user.$id, profile.userId || profile.$id].sort().join('_'),
              participant: profile,
              lastMessage: { content: 'Clicca per chattare...', sentAt: '', senderId: '' },
              unreadCount: 0,
              isParticipantTyping: false
          }));
      }
      
      const unreadRes = await databases.listDocuments<Message>(
        APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections.messages,
        [Query.equal('receiverId', user.$id), Query.equal('isRead', false)]
      );

      unreadRes.documents.forEach(msg => {
          const conv = initialConvs.find(c => c.conversationId === msg.conversationId);
          if (conv) {
              conv.unreadCount += 1;
              if (msg.$createdAt > conv.lastMessage.sentAt) {
                 conv.lastMessage = { content: msg.content, sentAt: msg.$createdAt, senderId: msg.senderId };
              }
          }
      });

      initialConvs.sort((a, b) => {
          if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
          return new Date(b.lastMessage.sentAt).getTime() - new Date(a.lastMessage.sentAt).getTime();
      });
      
      setConversations(initialConvs);
    } catch (err) {
      console.error('Widget Error loading conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isHidden) loadConversations();
  }, [isHidden, loadConversations]);

  useEffect(() => {
    if (!user?.$id || isHidden) return;

    const channelMsgs = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.messages}.documents`;
    const unsubscribeMsgs = client.subscribe(channelMsgs, (response: any) => {
        const payload = response.payload as Message;
        const isCreation = response.events.some((e: string) => e.includes('.create'));
        const isUpdate = response.events.some((e: string) => e.includes('.update'));

        setConversations(prev => {
            const convIndex = prev.findIndex(c => c.conversationId === payload.conversationId);
            if (convIndex === -1) {
                if (isCreation) loadConversations();
                return prev;
            }
            
            const newConvs = [...prev];
            if (isCreation) {
                newConvs[convIndex].lastMessage = { content: payload.content, sentAt: payload.$createdAt, senderId: payload.senderId };
                if (payload.receiverId === user.$id && selectedConversationId !== payload.conversationId) {
                    newConvs[convIndex].unreadCount += 1;
                }
                const [updatedConv] = newConvs.splice(convIndex, 1);
                newConvs.unshift(updatedConv);
            } else if (isUpdate && payload.isRead) {
                newConvs[convIndex].unreadCount = 0;
            }
            return newConvs;
        });
    });

    const channelProfiles = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.profiles}.documents`;
    const unsubscribeProfiles = client.subscribe(channelProfiles, (response: any) => {
        if (response.events.some((e: string) => e.includes('.update'))) {
            const payload = response.payload as UserProfile | StructureProfile;
            const profileId = payload.userId || payload.$id;
            const typingTarget = payload.typingTo;
            const isOnline = payload.isOnline;

            setConversations(prev => prev.map(conv => {
                if ((conv.participant.userId || conv.participant.$id) === profileId) {
                    return { 
                        ...conv, 
                        isParticipantTyping: typingTarget === user.$id,
                        participant: { ...conv.participant, isOnline } 
                    };
                }
                return conv;
            }));
        }
    });

    return () => { unsubscribeMsgs(); unsubscribeProfiles(); };
  }, [user?.$id, isHidden, selectedConversationId, loadConversations]);

  const handleSelectConversation = (convId: string) => {
    setConversations(prev => prev.map(c => c.conversationId === convId ? { ...c, unreadCount: 0 } : c));
    setSelectedConversationId(convId);
    if (user?.$id) databaseService.markMessagesAsRead(convId, user.$id);
  };

  if (isHidden || !user) return null;

  const totalUnread = conversations.reduce((acc, curr) => acc + curr.unreadCount, 0);
  const selectedConversation = conversations.find(c => c.conversationId === selectedConversationId);

  return (
    <div 
        className="hidden md:flex fixed bottom-0 right-6 w-80 bg-white shadow-[0_0_20px_rgba(0,0,0,0.15)] rounded-t-2xl border border-slate-200 z-50 flex-col overflow-hidden transition-all duration-300 ease-in-out"
        style={{ height: isOpen ? '500px' : '52px' }}
    >
      <div 
        className="h-[52px] bg-white border-b border-slate-200 flex items-center justify-between px-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
                src={user.avatar || user.logo || initialsAvatar(user.firstName || user.structureName || 'User')} 
                className="w-8 h-8 rounded-full border border-slate-200 object-cover" 
                alt="Me" 
            />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></div>
          </div>
          <span className="font-bold text-slate-800 text-sm">Messaggistica</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          {totalUnread > 0 && !isOpen && (
             <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalUnread}</span>
          )}
          <Icon type={(isOpen ? 'chevron-down' : 'chevron-up') as any} className="w-5 h-5" />
        </div>
      </div>

      {isOpen && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
          {selectedConversationId && selectedConversation ? (
            <div className="absolute inset-0 z-10 bg-white flex flex-col animate-in slide-in-from-right-4 duration-200">
                <ChatWindow
                    currentUserId={user.$id}
                    participant={selectedConversation.participant}
                    conversationId={selectedConversationId}
                    onBack={() => setSelectedConversationId(null)}
                    onProfileClick={(id) => navigate(`/profile/${id}`)}
                    isWidget={true}
                />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isLoading ? (
                 <div className="flex justify-center items-center h-full">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                 </div>
              ) : conversations.length === 0 ? (
                 <div className="p-6 text-center text-slate-400 text-sm">Non hai ancora collegamenti attivi.</div>
              ) : (
                 <div className="divide-y divide-slate-100">
                    {conversations.map(conv => (
                      <ConversationListItem
                        key={conv.conversationId}
                        conversation={conv}
                        currentUserId={user.$id}
                        isSelected={false}
                        onSelect={() => handleSelectConversation(conv.conversationId)}
                      />
                    ))}
                 </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};