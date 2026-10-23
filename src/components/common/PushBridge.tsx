import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { syncPushSubscription } from '@/services/push';

/**
 * Collega il service worker all'app: apre la pagina giusta quando si tocca una
 * notifica con l'app già aperta, e riallinea la sottoscrizione push dopo il login.
 */
export const PushBridge: React.FC = () => {
    const navigate = useNavigate();
    const { authenticated } = useAuth();

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        const onMessage = (event: MessageEvent) => {
            const data = event.data as { type?: string; url?: string } | null;
            if (data?.type === 'swimin:navigate' && typeof data.url === 'string' && data.url.startsWith('/')) navigate(data.url);
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, [navigate]);

    useEffect(() => {
        if (authenticated) void syncPushSubscription();
    }, [authenticated]);

    return null;
};
