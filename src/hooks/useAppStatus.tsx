import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { APP_STATUS_OK, databaseService, type AppStatus } from '@/services/database';
import { RECONNECTED_EVENT } from '@/components/common/ConnectionStatus';
import { useAuth } from '@/hooks/useAuth';

/**
 * Manutenzione decisa al momento del rilascio (variabile d'ambiente su Vercel): serve quando
 * Appwrite stesso non risponde e lo stato del servizio non si può leggere.
 */
const BUILD_MAINTENANCE = import.meta.env.VITE_MAINTENANCE === 'on';
const BUILD_MESSAGE = import.meta.env.VITE_MAINTENANCE_MESSAGE || 'Stiamo aggiornando SwimIn. Torniamo online a breve.';

interface AppStatusContextValue {
    status: AppStatus;
    /** false se il server non risponde (non per mancanza di rete: quella la segnala ConnectionStatus). */
    reachable: boolean;
    loaded: boolean;
    refresh: () => Promise<void>;
}

const AppStatusContext = createContext<AppStatusContextValue>({ status: APP_STATUS_OK, reachable: true, loaded: false, refresh: async () => {} });

/** Il server non ha risposto: errore di rete con la rete accesa, oppure errore 5xx. */
const isOutage = (err: unknown) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const code = (err as { code?: number })?.code;
    return !code || code >= 500;
};

/**
 * Stato del servizio per tutta l'app: si legge all'avvio, quando la pagina torna in primo piano,
 * quando torna la rete e, per chi ha fatto l'accesso, in tempo reale.
 */
export const AppStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { authenticated } = useAuth();
    const [status, setStatus] = useState<AppStatus>(BUILD_MAINTENANCE ? { mode: 'maintenance', message: BUILD_MESSAGE, until: '', updatedAt: null, inviteOnly: true } : APP_STATUS_OK);
    // Tentativi falliti di fila: il server è "irraggiungibile" dal secondo (un errore isolato non basta).
    const [failures, setFailures] = useState(0);
    const reachable = failures < 2;
    const [loaded, setLoaded] = useState(BUILD_MAINTENANCE);

    const refresh = useCallback(async () => {
        if (BUILD_MAINTENANCE) return;
        try {
            setStatus(await databaseService.getAppStatus());
            setFailures(0);
        } catch (err) {
            if (isOutage(err)) {
                setFailures((n) => n + 1);
            } else {
                console.warn('Stato del servizio non letto:', err);
            }
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        void refresh();
        const onVisible = () => document.visibilityState === 'visible' && void refresh();
        const onBack = () => void refresh();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener(RECONNECTED_EVENT, onBack);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener(RECONNECTED_EVENT, onBack);
        };
    }, [refresh]);

    // Server non raggiungibile: si riprova da soli ogni 20 secondi (secondo tentativo subito dopo il primo errore).
    useEffect(() => {
        if (BUILD_MAINTENANCE || failures === 0) return;
        const t = window.setTimeout(() => void refresh(), failures === 1 ? 4000 : 20_000);
        return () => window.clearTimeout(t);
    }, [failures, refresh]);

    // In manutenzione la pagina si sblocca da sola quando gli amministratori la chiudono.
    useEffect(() => {
        if (BUILD_MAINTENANCE || status.mode !== 'maintenance' || authenticated) return;
        const t = window.setInterval(() => void refresh(), 30_000);
        return () => window.clearInterval(t);
    }, [status.mode, authenticated, refresh]);

    // Tempo reale per chi ha fatto l'accesso (gli ospiti non aprono una connessione solo per questo).
    useEffect(() => {
        if (BUILD_MAINTENANCE || !authenticated) return;
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.appStatus}.documents`;
        let unsubscribe: (() => void) | null = null;
        try {
            unsubscribe = client.subscribe(channel, () => void refresh());
        } catch (err) {
            console.warn('Stato del servizio in tempo reale non disponibile:', err);
        }
        return () => unsubscribe?.();
    }, [authenticated, refresh]);

    const value = useMemo(() => ({ status, reachable, loaded, refresh }), [status, reachable, loaded, refresh]);
    return <AppStatusContext.Provider value={value}>{children}</AppStatusContext.Provider>;
};

export const useAppStatus = () => useContext(AppStatusContext);

/** "alle 23:30" oppure "il 30/10 alle 23:30" per la fine prevista. */
export function formatUntil(iso: string, now: Date = new Date()): string {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
    const day = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' });
    const today = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' });
    return day === today ? `alle ${time}` : `il ${day} alle ${time}`;
}
