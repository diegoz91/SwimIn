import React, { useState, useEffect, useRef } from 'react';
import { databaseService } from '@/services/database';
import { databases, client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { ID, Query } from 'appwrite';
import type { UserProfile, StructureProfile, Message } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { initialsAvatar } from '@/utils/avatar';

interface ChatWindowProps {
  currentUserId: string;
  participant: UserProfile | StructureProfile;
  conversationId: string;
  onBack: () => void;
  onProfileClick?: (userId: string) => void;
  isWidget?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ 
  currentUserId, 
  participant,
  conversationId,
  onBack,
  onProfileClick,
  isWidget = false 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isParticipantTyping, setIsParticipantTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { showToast } = useToast();

  const participantId = participant.userId || participant.$id;

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isParticipantTyping]);

  useEffect(() => {
    let isMounted = true;

    const loadMessages = async () => {
      try {
        const msgs = await databases.listDocuments<Message>(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.messages,
            [Query.equal('conversationId', conversationId), Query.orderAsc('$createdAt'), Query.limit(100)]
        );
        if (isMounted) setMessages(msgs.documents);
        
        await databaseService.markMessagesAsRead(conversationId, currentUserId);
      } catch (error) {
        console.error('Error loading messages:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadMessages();

    const channelMessages = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.messages}.documents`;
    const unsubscribeMessages = client.subscribe(channelMessages, (response: any) => {
        const payload = response.payload as Message;
        
        if (payload.conversationId === conversationId) {
            const isCreate = response.events.some((e: string) => e.includes('.create'));
            const isUpdate = response.events.some((e: string) => e.includes('.update'));

            if (isCreate) {
                setMessages(prev => {
                    if (prev.some(m => m.$id === payload.$id || (m.$id.startsWith('temp_') && m.content === payload.content))) {
                        return prev.map(m => (m.$id.startsWith('temp_') && m.content === payload.content) ? payload : m);
                    }
                    return [...prev, payload];
                });
                
                if (payload.receiverId === currentUserId) {
                    databaseService.markMessagesAsRead(conversationId, currentUserId);
                }
            } else if (isUpdate) {
                setMessages(prev => prev.map(msg => msg.$id === payload.$id ? payload : msg));
            }
        }
    });

    const channelProfile = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.profiles}.documents.${participantId}`;
    const unsubscribeProfile = client.subscribe(channelProfile, (response: any) => {
        const isUpdate = response.events.some((e: string) => e.includes('.update'));
        if (isUpdate) {
            setIsParticipantTyping(response.payload.typingTo === currentUserId);
        }
    });

    return () => {
      isMounted = false;
      unsubscribeMessages();
      unsubscribeProfile();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      databaseService.setTypingStatus(currentUserId, null);
    };
  }, [conversationId, currentUserId, participantId]);

  const handleTyping = (text: string) => {
      setNewMessage(text);
      databaseService.setTypingStatus(currentUserId, participantId);
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
          databaseService.setTypingStatus(currentUserId, null);
      }, 2000);
  };

  const handleSendMessage = async () => {
    const trimmedText = newMessage.trim();
    if (!trimmedText || isSending) return;

    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
        $id: tempId,
        conversationId,
        senderId: currentUserId,
        receiverId: participantId,
        content: trimmedText,
        isRead: false,
        $createdAt: new Date().toISOString(),
    } as Message;

    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage('');
    databaseService.setTypingStatus(currentUserId, null);

    try {
      setIsSending(true);
      await databaseService.sendMessage(conversationId, currentUserId, participantId, trimmedText);
    } catch (error) {
      console.error("🔥 ERRORE APPWRITE INVIO:", error);
      setMessages(prev => prev.filter(m => m.$id !== tempId));
      showToast("Errore nell'invio. Riprova.", "error");
    } finally {
      setIsSending(false);
    }
  };

  const formatTimestamp = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  const getParticipantName = (): string => {
    if (participant.userType === 'professional') {
      return `${(participant as UserProfile).firstName || ''} ${(participant as UserProfile).lastName || ''}`.trim() || 'Utente';
    }
    return (participant as StructureProfile).structureName || 'Struttura';
  };

  const getParticipantAvatar = (): string => {
    const name = getParticipantName();
    if (participant.userType === 'professional' && (participant as UserProfile).avatar) return (participant as UserProfile).avatar as string;
    if (participant.userType === 'structure' && (participant as StructureProfile).logo) return (participant as StructureProfile).logo as string;
    return initialsAvatar(name);
  };

  const allowReadReceipts = participant.readReceipts !== false;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 relative">
      <div className="flex items-center p-3 sm:p-4 border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <button 
            onClick={onBack} 
            className={`${isWidget ? 'block' : 'md:hidden'} mr-3 p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
        >
          <Icon type="arrow-left" className="w-6 h-6" />
        </button>
        
        <div 
          className="flex items-center cursor-pointer hover:bg-slate-50 rounded-xl p-2 -ml-2 transition-colors flex-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={() => onProfileClick?.(participantId)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onProfileClick?.(participantId); }}
        >
          <img src={getParticipantAvatar()} alt={getParticipantName()} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover mr-3 border border-slate-100 shadow-sm bg-white" />
          <div>
            <p className="font-bold text-slate-800 leading-tight text-sm sm:text-base">{getParticipantName()}</p>
            {isParticipantTyping ? (
                <p className="text-xs sm:text-sm text-blue-500 font-bold italic animate-pulse">Sta scrivendo...</p>
            ) : (
                <p className="text-xs sm:text-sm text-slate-500 truncate">
                {participant.userType === 'professional' ? (participant as UserProfile).title : (participant as StructureProfile).structureType}
                </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-80">
            <Icon type="chat-bubble" className="w-12 h-12 sm:w-16 sm:h-16 mb-4 text-slate-300" />
            <p className="font-medium text-slate-600 text-sm sm:text-base">Nessun messaggio</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => {
              const isMe = msg.senderId === currentUserId;
              const showAvatar = !isMe && (index === messages.length - 1 || messages[index + 1].senderId === currentUserId);
              
              return (
                <div key={msg.$id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                  {!isMe && (
                    <div className="w-6 sm:w-8 flex-shrink-0">
                      {showAvatar && (
                        <img src={getParticipantAvatar()} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover shadow-sm bg-white" alt="Avatar" />
                      )}
                    </div>
                  )}
                  
                  <div className={`relative group rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 max-w-[85%] sm:max-w-md shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'}`}>
                    <p className="text-[14px] sm:text-[15px] break-words whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <div className={`flex justify-end items-center gap-1 mt-1 text-[10px] sm:text-[11px] ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                      <span>{formatTimestamp((msg as any).sentAt || msg.$createdAt)}</span>
                      {isMe && (
                        <Icon 
                          type={msg.isRead && allowReadReceipts ? "check-double" : "check"} 
                          className={`w-3.5 h-3.5 ${msg.isRead && allowReadReceipts ? 'text-white' : 'text-blue-300'}`} 
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {isParticipantTyping && (
                 <div className="flex items-end gap-2 justify-start animate-in fade-in slide-in-from-bottom-2">
                    <div className="w-6 sm:w-8 flex-shrink-0">
                        <img src={getParticipantAvatar()} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover shadow-sm bg-white" alt="Avatar" />
                    </div>
                    <div className="bg-white border border-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-3 py-2 sm:px-4 sm:py-3 shadow-sm flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="p-2 sm:p-3 bg-white border-t border-slate-200">
        <div className="flex items-center gap-2 bg-slate-50 p-1 sm:p-1.5 rounded-full border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Scrivi..."
            className="flex-1 bg-transparent py-1.5 px-3 focus:outline-none text-slate-800 placeholder-slate-400 text-sm sm:text-base"
            disabled={isSending}
          />
          
          <button 
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isSending}
            className="bg-blue-600 text-white rounded-full p-2 sm:p-2.5 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isSending ? (
               <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Icon type="send" className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};