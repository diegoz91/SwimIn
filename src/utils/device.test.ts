import { describe, expect, it } from 'vitest';
import { detectDevice, permissionHelp } from './device';

const env = (userAgent: string, extra: Partial<Parameters<typeof detectDevice>[0]> = {}) => ({
    userAgent,
    maxTouchPoints: 0,
    standalone: false,
    secure: true,
    hasGetUserMedia: true,
    hasGetDisplayMedia: true,
    ...extra,
});

const UA = {
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
};

describe('detectDevice', () => {
    it('computer: schermo condivisibile, con audio su Chrome ed Edge', () => {
        expect(detectDevice(env(UA.chromeWin))).toMatchObject({ kind: 'desktop', os: 'windows', browser: 'chrome', canShareScreen: true, canShareAudio: true });
        expect(detectDevice(env(UA.edge))).toMatchObject({ browser: 'edge', canShareAudio: true });
        expect(detectDevice(env(UA.safariMac))).toMatchObject({ kind: 'desktop', os: 'mac', browser: 'safari', canShareScreen: true, canShareAudio: false });
    });

    it('smartphone e tablet: niente condivisione dello schermo', () => {
        expect(detectDevice(env(UA.iphone))).toMatchObject({ kind: 'phone', os: 'ios', browser: 'safari', canShareScreen: false });
        expect(detectDevice(env(UA.androidPhone))).toMatchObject({ kind: 'phone', os: 'android', canShareScreen: false });
        expect(detectDevice(env(UA.androidTablet))).toMatchObject({ kind: 'tablet', os: 'android' });
    });

    it('iPad che si presenta come Mac è un tablet iOS', () => {
        expect(detectDevice(env(UA.safariMac, { maxTouchPoints: 5 }))).toMatchObject({ kind: 'tablet', os: 'ios', canShareScreen: false });
    });

    it('app installata e connessione non sicura', () => {
        expect(detectDevice(env(UA.iphone, { standalone: true })).installed).toBe(true);
        const insecure = detectDevice(env(UA.chromeWin, { secure: false }));
        expect([insecure.canUseCamera, insecure.canShareScreen]).toEqual([false, false]);
        expect(permissionHelp(insecure)).toContain('https');
    });

    it('istruzioni per i permessi adatte al sistema', () => {
        expect(permissionHelp(detectDevice(env(UA.iphone)))).toContain('iPhone');
        expect(permissionHelp(detectDevice(env(UA.androidPhone)))).toContain('Android');
        expect(permissionHelp(detectDevice(env(UA.safariMac)))).toContain('Safari');
        expect(permissionHelp(detectDevice(env(UA.chromeWin)))).toContain('lucchetto');
    });
});
