import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { emitNetworkChange } from '@/utils/networkEvents';

interface BlocksValue {
    blocked: string[];
    muted: string[];
    /** Utenti che hanno bloccato me: i loro contenuti non vanno mostrati. */
    blockedBy: string[];
    isAdmin: boolean;
    /** Nascondere del tutto (blocco in una delle due direzioni). */
    isHidden: (userId?: string) => boolean;
    /** Nascondere dal feed (bloccati o silenziati). */
    isMutedOrHidden: (userId?: string) => boolean;
    block: (userId: string, kind?: 'block' | 'mute') => Promise<boolean>;
    unblock: (userId: string, kind?: 'block' | 'mute') => Promise<boolean>;
}

const BlocksContext = createContext<BlocksValue | null>(null);

/** Blocchi e silenziamenti dell'utente, caricati una volta e condivisi da tutta l'app. */
export const BlocksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [state, setState] = useState({ blocked: [] as string[], muted: [] as string[], blockedBy: [] as string[], isAdmin: false });

    const load = useCallback(() => {
        if (!user) return setState({ blocked: [], muted: [], blockedBy: [], isAdmin: false });
        databaseService
            .listBlockRelations()
            // Risposta incompleta (es. Function non aggiornata): elenchi vuoti invece di un errore.
            .then((r) => setState({ blocked: r?.blocked || [], muted: r?.muted || [], blockedBy: r?.blockedBy || [], isAdmin: !!r?.isAdmin }))
            .catch((e) => console.warn('Blocchi non disponibili:', e));
    }, [user?.$id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        load();
    }, [load]);

    const block = useCallback(
        async (userId: string, kind: 'block' | 'mute' = 'block') => {
            try {
                await databaseService.blockUser(userId, kind);
                setState((s) => (kind === 'block' ? { ...s, blocked: [...new Set([...s.blocked, userId])] } : { ...s, muted: [...new Set([...s.muted, userId])] }));
                showToast(kind === 'block' ? 'Utente bloccato: non potrà più contattarti né vedere i tuoi contenuti.' : 'Utente silenziato: non vedrai più i suoi post nel feed.', 'success');
                if (kind === 'block') emitNetworkChange({ type: 'removed', userId });
                return true;
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Operazione non riuscita.', 'error');
                return false;
            }
        },
        [showToast]
    );

    const unblock = useCallback(
        async (userId: string, kind: 'block' | 'mute' = 'block') => {
            try {
                await databaseService.unblockUser(userId, kind);
                setState((s) => (kind === 'block' ? { ...s, blocked: s.blocked.filter((x) => x !== userId) } : { ...s, muted: s.muted.filter((x) => x !== userId) }));
                showToast(kind === 'block' ? 'Utente sbloccato.' : 'Non è più silenziato.', 'info');
                return true;
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Operazione non riuscita.', 'error');
                return false;
            }
        },
        [showToast]
    );

    const value = useMemo<BlocksValue>(() => {
        const hidden = new Set([...state.blocked, ...state.blockedBy]);
        const feedHidden = new Set([...hidden, ...state.muted]);
        return {
            ...state,
            isHidden: (id?: string) => !!id && hidden.has(id),
            isMutedOrHidden: (id?: string) => !!id && feedHidden.has(id),
            block,
            unblock,
        };
    }, [state, block, unblock]);

    return <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>;
};

const EMPTY: BlocksValue = {
    blocked: [], muted: [], blockedBy: [], isAdmin: false,
    isHidden: () => false, isMutedOrHidden: () => false,
    block: async () => false, unblock: async () => false,
};

/** Fuori dal provider (es. pagine pubbliche) non nasconde nulla. */
export const useBlocks = () => useContext(BlocksContext) || EMPTY;
