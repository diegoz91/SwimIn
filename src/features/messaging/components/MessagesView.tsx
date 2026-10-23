import React, { useState, useEffect, useCallback } from 'react';
import { Query } from 'appwrite';
import { ChatWindow } from './ChatWindow';
import { messagePreview } from '@/services/chatFiles';
import { ConversationListItem } from './ConversationListItem';
import { databaseService } from '@/services/database'; 
import { databases, client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import type { UserProfile, StructureProfile, Message } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { useBlocks } from '@/context/BlocksContext';

interface Conversation {
  conversationId: string;
  participant: UserProfile | StructureProfile;
  lastMessage: {
    content: string;
    sentAt: string;
    senderId: string;
  };
  unreadCount: number;
  isParticipantTyping?: boolean;
}

interface MessagesViewProps {
  currentUserId: string;
  startChatWithUserId?: string | null;
  onProfileClick?: (userId: string) => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ 
  currentUserId,
  startChatWithUserId,
  onProfileClick 
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
    const blocks = useBlocks();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newChatParticipant, setNewChatParticipant] = useState<UserProfile | StructureProfile | null>(null);
  const { showToast } = useToast();

  const loadConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // 💡 Recupera i collegamenti AGGIORNATI dal DB
      const currentUserProfile = await databaseService.getProfile(currentUserId);
      const safeConnections = (currentUserProfile.connections || []).slice(0, 100);

      let initialConvs: Conversation[] = [];

      if (safeConnections.length > 0) {
          const res = await databases.listDocuments<UserProfile | StructureProfile>(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.profiles,
              [Query.equal('$id', safeConnections), Query.limit(100)]
          );
          
          initialConvs = res.documents.map(profile => ({
              conversationId: [currentUserId, profile.userId || profile.$id].sort().join('_'),
              participant: profile,
              lastMessage: { content: 'Clicca per chattare...', sentAt: '', senderId: '' },
              unreadCount: 0,
              isParticipantTyping: false
          }));
      }
      
      const unreadRes = await databases.listDocuments<Message>(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.messages,
        [Query.equal('receiverId', currentUserId), Query.equal('isRead', false)]
      );

      // Elimina silenziosamente i messaggi non letti provenienti da utenti non collegati (Anti-Spam)
      unreadRes.documents.forEach(msg => {
          const conv = initialConvs.find(c => c.conversationId === msg.conversationId);
          if (conv) {
              conv.unreadCount += 1;
              if (msg.$createdAt > conv.lastMessage.sentAt) {
                 conv.lastMessage = { content: messagePreview(msg), sentAt: msg.$createdAt, senderId: msg.senderId };
              }
          }
      });

      initialConvs.sort((a, b) => {
          if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
          return new Date(b.lastMessage.sentAt).getTime() - new Date(a.lastMessage.sentAt).getTime();
      });
      
      setConversations(initialConvs);
    } catch (err) {
      console.error('Error loading conversations:', err);
      setError('Impossibile caricare le conversazioni. Riprova più tardi.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (startChatWithUserId && startChatWithUserId !== currentUserId) {
      startNewChat(startChatWithUserId);
    }
  }, [startChatWithUserId]);

  useEffect(() => {
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
                newConvs[convIndex].lastMessage = { 
                    content: messagePreview(payload), 
                    sentAt: payload.$createdAt, 
                    senderId: payload.senderId 
                };
                
                if (payload.receiverId === currentUserId && selectedConversationId !== payload.conversationId) {
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
            const profileId = response.payload.userId || response.payload.$id;
            const typingTarget = response.payload.typingTo;
            
            setConversations(prev => prev.map(conv => {
                if ((conv.participant.userId || conv.participant.$id) === profileId) {
                    return { ...conv, isParticipantTyping: typingTarget === currentUserId };
                }
                return conv;
            }));
        }
    });

    return () => {
        unsubscribeMsgs();
        unsubscribeProfiles();
    };
  }, [currentUserId, selectedConversationId, loadConversations]);

  const handleSelectConversation = (convId: string) => {
    setConversations(prev => prev.map(c => c.conversationId === convId ? { ...c, unreadCount: 0 } : c));
    setSelectedConversationId(convId);
    databaseService.markMessagesAsRead(convId, currentUserId);
  };

  const startNewChat = async (userId: string) => {
    try {
      const conversationId = [currentUserId, userId].sort().join('_');
      const existingConv = conversations.find(c => c.conversationId === conversationId);
      
      if (existingConv) {
        handleSelectConversation(conversationId);
      } else {
        const participant = await databaseService.getProfile(userId);
        setNewChatParticipant(participant);
        setSelectedConversationId(conversationId);
      }
    } catch (error) {
      showToast('Impossibile avviare la conversazione. Riprova.', 'error');
    }
  };

  const selectedConversation = conversations.find(c => c.conversationId === selectedConversationId);
  const handleBackToList = () => {
    setSelectedConversationId(null);
    setNewChatParticipant(null);
  };

  const showList = !selectedConversationId;
  const chatParticipant = selectedConversation?.participant || newChatParticipant;

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] md:h-[calc(100dvh-9rem)] max-w-6xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in duration-500">
      
      <div className={`w-full md:w-[380px] flex-col bg-slate-50 border-r border-slate-200 ${showList ? 'flex' : 'hidden md:flex'}`}>
        <div className="p-5 border-b border-slate-200 bg-white">
          <h2 className="text-2xl font-extrabold text-slate-800">Messaggi</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-blue-600"></div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <p className="text-sm text-red-500 font-medium">{error}</p>
            </div>
          ) : conversations.length === 0 && !newChatParticipant ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400">
              <Icon type="users" className="w-12 h-12 text-slate-300 mb-4" />
              <p className="font-bold text-slate-600">Nessun collegamento</p>
              <p className="text-sm mt-2">Visita il profilo di un collega ed espandi il tuo network per iniziare a chattare!</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {conversations.filter((conv) => !blocks.isHidden(conv.participant?.userId || conv.participant?.$id)).map(conv => (
                <ConversationListItem
                  key={conv.conversationId}
                  conversation={conv}
                  currentUserId={currentUserId}
                  isSelected={conv.conversationId === selectedConversationId}
                  onSelect={() => handleSelectConversation(conv.conversationId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`flex-1 min-w-0 flex-col bg-white ${!showList ? 'flex' : 'hidden md:flex'}`}>
        {chatParticipant && selectedConversationId ? (
          <ChatWindow
            key={selectedConversationId}
            currentUserId={currentUserId}
            participant={chatParticipant}
            conversationId={selectedConversationId}
            onBack={handleBackToList}
            onProfileClick={onProfileClick}
          />
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50">
            <Icon type="mail" className="w-24 h-24 text-slate-200 mb-6" />
            <h3 className="text-2xl font-bold text-slate-600">I tuoi messaggi</h3>
            <p className="mt-2 font-medium">Seleziona una conversazione dalla lista per iniziare a chattare</p>
          </div>
        )}
      </div>
    </div>
  );
};