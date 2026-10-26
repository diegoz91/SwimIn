import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import type { SavedItem } from '@/types/types';

interface SavedContextValue {
    items: SavedItem[];
    isSaved: (type: SavedItem['targetType'], id: string) => boolean;
    toggle: (type: SavedItem['targetType'], id: string) => Promise<void>;
}

const SavedContext = createContext<SavedContextValue | null>(null);

/** Elementi salvati dall'utente, caricati una volta e condivisi da tutta l'app. */
export const SavedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [items, setItems] = useState<SavedItem[]>([]);

    useEffect(() => {
        if (!user) {
            setItems([]);
            return;
        }
        databaseService.getSavedItems(user.$id).then(setItems).catch((e) => console.warn('Salvati non disponibili:', e));
    }, [user?.$id]); // eslint-disable-line react-hooks/exhaustive-deps

    const isSaved = useCallback((type: SavedItem['targetType'], id: string) => items.some((i) => i.targetType === type && i.targetId === id), [items]);

    const toggle = useCallback(
        async (type: SavedItem['targetType'], id: string) => {
            if (!user) return;
            const existing = items.find((i) => i.targetType === type && i.targetId === id);
            try {
                if (existing) {
                    setItems((prev) => prev.filter((i) => i.$id !== existing.$id));
                    await databaseService.unsaveItem(existing.$id);
                    showToast('Rimosso dai salvati.', 'info', {
                        action: {
                            label: 'Annulla',
                            onClick: () => {
                                databaseService
                                    .saveItem(user.$id, type, id)
                                    .then((again) => setItems((prev) => [again, ...prev]))
                                    .catch((err) => { console.error('Ripristino salvato:', err); showToast('Non è stato possibile ripristinarlo.', 'error'); });
                            },
                        },
                    });
                } else {
                    const saved = await databaseService.saveItem(user.$id, type, id);
                    setItems((prev) => [saved, ...prev]);
                    showToast(type === 'job' ? 'Offerta salvata.' : 'Post salvato.', 'success');
                }
            } catch (error) {
                console.error('Salvataggio elemento:', error);
                if (existing) setItems((prev) => [existing, ...prev]);
                showToast('Operazione non riuscita.', 'error');
            }
        },
        [user, items, showToast]
    );

    const value = useMemo(() => ({ items, isSaved, toggle }), [items, isSaved, toggle]);
    return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
};

export const useSaved = () => {
    const ctx = useContext(SavedContext);
    if (!ctx) throw new Error('useSaved deve essere usato dentro SavedProvider');
    return ctx;
};
