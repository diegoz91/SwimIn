import React, { useState, useEffect } from 'react';
import { ChatWindow } from './ChatWindow';
import { ConversationListItem } from './ConversationListItem';
import { databaseService } from '@/services/database';
import type { UserProfile, StructureProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '../useConversations';
import { conversationIdOf, filterConversations } from '../conversations';

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
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newChatParticipant, setNewChatParticipant] = useState<UserProfile | StructureProfile | null>(null);
  const [query, setQuery] = useState('');
  const { showToast } = useToast();
  // Stesso elenco del widget: tutte le conversazioni (anche con chi non è un collegamento), poi i collegamenti.
  const { conversations, loading: isLoading, error: loadError, markRead } = useConversations(
    currentUserId, user?.connections || [], true, selectedConversationId ? [selectedConversationId] : [],
  );
  const error = loadError ? 'Impossibile caricare le conversazioni. Riprova più tardi.' : null;

  useEffect(() => {
    if (startChatWithUserId && startChatWithUserId !== currentUserId) {
      void startNewChat(startChatWithUserId);
    }
  }, [startChatWithUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectConversation = (convId: string) => {
    setSelectedConversationId(convId);
    markRead(convId);
  };

  const startNewChat = async (userId: string) => {
    try {
      const conversationId = conversationIdOf(currentUserId, userId);
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
    <div className="flex h-[calc(100dvh-11rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-8.5rem)] max-w-6xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in duration-500">
      
      <div className={`w-full md:w-80 lg:w-[380px] shrink-0 flex-col bg-slate-50 border-r border-slate-200 ${showList ? 'flex' : 'hidden md:flex'}`}>
        <div className="p-5 border-b border-slate-200 bg-white space-y-3">
          <h2 className="text-2xl font-bold text-slate-800">Messaggi</h2>
          <label className="relative block">
            <span className="sr-only">Cerca nei messaggi</span>
            <Icon type="search" className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per nome o messaggio" className="w-full pl-9 pr-3 py-2 rounded-full bg-piastrella border border-transparent focus:border-corsia-300 text-sm outline-hidden" />
          </label>
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
              {filterConversations(conversations, query).map(conv => (
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
          <div className="hidden md:flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50 text-center px-8">
            <Icon type="mail" className="w-24 h-24 text-slate-200 mb-6" />
            <h2 className="text-3xl font-bold text-abisso">I tuoi messaggi</h2>
            <p className="mt-2 text-slate-500 max-w-xs">Scegli una conversazione dall’elenco, oppure scrivi a un collegamento dalla sua pagina.</p>
          </div>
        )}
      </div>
    </div>
  );
};