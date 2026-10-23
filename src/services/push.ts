/**
 * Service worker e notifiche push del browser.
 * Il server (Function `api`) conserva le sottoscrizioni e invia le push con VAPID.
 */
import { databaseService } from '@/services/database';

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Registra il service worker (solo in produzione: in sviluppo darebbe cache vecchie). */
export function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker non registrato:', err));
    });
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration()) || null;
}

/** Stato delle push su questo dispositivo. */
export async function pushState(): Promise<PushState> {
    if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const keyBytes = (base64url: string) => {
    const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
    const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const toB64u = (buf: ArrayBuffer | null) =>
    buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

/** Chiede il permesso, crea la sottoscrizione e la registra sul server. */
export async function enablePush(publicKey: string): Promise<PushState> {
    if (!pushSupported()) throw new Error('Questo browser non supporta le notifiche push.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
    const reg = (await registration()) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Una sottoscrizione creata con un'altra chiave non funzionerebbe: la rifacciamo.
    const current = sub?.options.applicationServerKey ? toB64u(sub.options.applicationServerKey) : null;
    if (sub && current && current !== publicKey) {
        await sub.unsubscribe();
        sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    await databaseService.savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: toB64u(sub.getKey('p256dh')),
        auth: toB64u(sub.getKey('auth')),
        userAgent: navigator.userAgent.slice(0, 255),
    });
    return 'on';
}

export async function disablePush(): Promise<PushState> {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
        await databaseService.deletePushSubscription(sub.endpoint).catch((err) => console.error('Rimozione dispositivo:', err));
        await sub.unsubscribe();
    }
    return 'off';
}

/**
 * Se le push sono già attive su questo dispositivo, riallinea la sottoscrizione
 * sul server (il browser può rinnovarla). Da chiamare dopo il login.
 */
export async function syncPushSubscription() {
    try {
        if (!pushSupported() || Notification.permission !== 'granted') return;
        const reg = await registration();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return;
        await databaseService.savePushSubscription({
            endpoint: sub.endpoint,
            p256dh: toB64u(sub.getKey('p256dh')),
            auth: toB64u(sub.getKey('auth')),
            userAgent: navigator.userAgent.slice(0, 255),
        });
    } catch (err) {
        console.error('Sincronizzazione push:', err);
    }
}
