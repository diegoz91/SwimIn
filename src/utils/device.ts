/**
 * Da dove si usa SwimIn: computer, smartphone o tablet, sistema, browser, app installata.
 * Serve alle dirette per mostrare solo ciò che il dispositivo sa fare (lo schermo si condivide
 * solo da computer) e per spiegare come riattivare i permessi di fotocamera e microfono.
 */
export type DeviceKind = 'desktop' | 'phone' | 'tablet';
export type DeviceOs = 'ios' | 'android' | 'windows' | 'mac' | 'linux' | 'other';
export type DeviceBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other';

export interface DeviceInfo {
    kind: DeviceKind;
    os: DeviceOs;
    browser: DeviceBrowser;
    /** App installata sulla schermata Home (PWA). */
    installed: boolean;
    /** HTTPS (o localhost): senza, il browser non dà accesso a fotocamera e microfono. */
    secure: boolean;
    canUseCamera: boolean;
    /** Condivisione dello schermo dal browser: solo sui computer. */
    canShareScreen: boolean;
    /** Audio della scheda o del sistema insieme allo schermo (Chrome ed Edge su computer). */
    canShareAudio: boolean;
}

interface Env {
    userAgent: string;
    maxTouchPoints: number;
    standalone: boolean;
    secure: boolean;
    hasGetUserMedia: boolean;
    hasGetDisplayMedia: boolean;
}

const readEnv = (): Env => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const media = nav?.mediaDevices;
    let standalone = false;
    try {
        standalone = window.matchMedia?.('(display-mode: standalone)').matches || (nav as Navigator & { standalone?: boolean })?.standalone === true;
    } catch (err) {
        console.warn('display-mode:', err);
    }
    return {
        userAgent: nav?.userAgent || '',
        maxTouchPoints: nav?.maxTouchPoints || 0,
        standalone,
        secure: typeof window !== 'undefined' ? window.isSecureContext !== false : true,
        hasGetUserMedia: typeof media?.getUserMedia === 'function',
        hasGetDisplayMedia: typeof media?.getDisplayMedia === 'function',
    };
};

/** Analisi pura (testabile) delle caratteristiche del browser. */
export function detectDevice(env: Env = readEnv()): DeviceInfo {
    const ua = env.userAgent;
    // iPadOS si presenta come Mac: lo tradisce il tocco.
    const iPadAsMac = /Macintosh/.test(ua) && env.maxTouchPoints > 1;
    const os: DeviceOs = /iPhone|iPad|iPod/.test(ua) || iPadAsMac ? 'ios' : /Android/.test(ua) ? 'android' : /Windows/.test(ua) ? 'windows' : /Macintosh|Mac OS X/.test(ua) ? 'mac' : /Linux|CrOS/.test(ua) ? 'linux' : 'other';
    const tablet = /iPad/.test(ua) || iPadAsMac || (os === 'android' && !/Mobile/.test(ua)) || /Tablet/.test(ua);
    const phone = !tablet && (/iPhone|iPod/.test(ua) || (os === 'android' && /Mobile/.test(ua)) || /Mobile/.test(ua));
    const kind: DeviceKind = tablet ? 'tablet' : phone ? 'phone' : 'desktop';
    const browser: DeviceBrowser = /SamsungBrowser/.test(ua) ? 'samsung' : /Edg\//.test(ua) ? 'edge' : /Firefox|FxiOS/.test(ua) ? 'firefox' : /Chrome|CriOS|Chromium/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'other';
    const canShareScreen = kind === 'desktop' && env.hasGetDisplayMedia && env.secure;
    return {
        kind,
        os,
        browser,
        installed: env.standalone,
        secure: env.secure,
        canUseCamera: env.hasGetUserMedia && env.secure,
        canShareScreen,
        canShareAudio: canShareScreen && (browser === 'chrome' || browser === 'edge'),
    };
}

export const isTouchDevice = (d: DeviceInfo) => d.kind !== 'desktop';

/** Come riattivare fotocamera e microfono quando il permesso è stato negato, per sistema e browser. */
export function permissionHelp(d: DeviceInfo): string {
    if (!d.secure) return 'Fotocamera e microfono funzionano solo su una connessione sicura (https).';
    if (d.os === 'ios') {
        if (d.installed) return 'Su iPhone e iPad: Impostazioni › Safari › Fotocamera e Microfono › Consenti, poi riapri SwimIn.';
        return d.browser === 'chrome'
            ? 'Su iPhone e iPad: Impostazioni › Chrome › attiva Fotocamera e Microfono, poi ricarica la pagina.'
            : 'Su iPhone e iPad: tocca «aA» nella barra degli indirizzi › Impostazioni sito web › Fotocamera e Microfono › Consenti.';
    }
    if (d.os === 'android') return 'Su Android: tocca il lucchetto accanto all’indirizzo › Autorizzazioni › Fotocamera e Microfono › Consenti. Se non compare, Impostazioni › App › browser › Autorizzazioni.';
    if (d.browser === 'safari') return 'In Safari: menu Safari › Impostazioni › Siti web › Fotocamera e Microfono › Consenti per questo sito.';
    if (d.browser === 'firefox') return 'In Firefox: clicca l’icona della fotocamera barrata nella barra degli indirizzi e togli il blocco.';
    const mac = d.os === 'mac' ? ' Su Mac controlla anche Impostazioni di Sistema › Privacy e sicurezza › Fotocamera e Microfono.' : '';
    return `Clicca il lucchetto accanto all’indirizzo › Fotocamera e Microfono › Consenti, poi ricarica la pagina.${mac}`;
}

/** Etichetta del dispositivo, per i testi dell'interfaccia. */
export const deviceLabel = (d: DeviceInfo) => (d.kind === 'desktop' ? 'computer' : d.kind === 'tablet' ? 'tablet' : 'smartphone');
