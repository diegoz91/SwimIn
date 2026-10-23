import { useCallback, useEffect, useState } from 'react';
import { isIOS } from '@/services/push';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// L'evento arriva una volta sola, spesso prima che il componente sia montato: lo teniamo da parte.
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferred = e as BeforeInstallPromptEvent;
        listeners.forEach((l) => l());
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        listeners.forEach((l) => l());
    });
}

export const isStandalone = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * Installazione dell'app sul telefono o sul computer.
 * `mode`: 'prompt' se il browser offre l'installazione, 'ios' se va fatta da Condividi,
 * 'installed' se l'app è già aperta come installata, 'none' altrimenti.
 */
export function useInstallPrompt() {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force((n) => n + 1);
        listeners.add(l);
        return () => { listeners.delete(l); };
    }, []);
    const mode: 'prompt' | 'ios' | 'installed' | 'none' = isStandalone() ? 'installed' : deferred ? 'prompt' : isIOS() ? 'ios' : 'none';
    const install = useCallback(async () => {
        if (!deferred) return false;
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        deferred = null;
        listeners.forEach((l) => l());
        return outcome === 'accepted';
    }, []);
    return { mode, install };
}
