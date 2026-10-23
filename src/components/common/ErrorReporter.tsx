import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';

const sent = new Set<string>();
const MAX_PER_SESSION = 20;

/** Invia al registro errori (pannello admin) un errore del client, una volta per messaggio. */
export function reportClientError(error: unknown, extra = '') {
    const e = error instanceof Error ? error : new Error(String(error));
    const key = `${e.message}|${extra}`;
    if (!e.message || sent.has(key) || sent.size >= MAX_PER_SESSION) return;
    // Rumore del browser che non dipende dall'app.
    if (/ResizeObserver loop|Script error\.|Load failed|NetworkError|Failed to fetch/i.test(e.message)) return;
    sent.add(key);
    void databaseService.logClientError({ message: e.message, stack: `${e.stack || ''}${extra ? `\n${extra}` : ''}`, url: window.location.pathname });
}

/** Raccoglie gli errori JavaScript non gestiti degli utenti con sessione attiva. */
export const ErrorReporter: React.FC = () => {
    const { authenticated } = useAuth();
    useEffect(() => {
        if (!authenticated) return;
        const onError = (ev: ErrorEvent) => reportClientError(ev.error || ev.message);
        const onRejection = (ev: PromiseRejectionEvent) => reportClientError(ev.reason);
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, [authenticated]);
    return null;
};
