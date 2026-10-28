/**
 * Codice di invito della fase di test: arriva dal QR o dal link (?invito=CODICE) su qualsiasi pagina
 * e resta sul dispositivo finché l'iscrizione non è completata (anche dopo l'accesso con Google).
 */
const KEY = 'swimin:invito';

export const normalizeInvite = (code: string | null | undefined) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

/** Legge ?invito= dall'indirizzo e lo ricorda. */
export function captureInviteFromUrl(search = typeof window !== 'undefined' ? window.location.search : '') {
    const code = normalizeInvite(new URLSearchParams(search).get('invito'));
    if (code.length >= 6) {
        try {
            localStorage.setItem(KEY, code);
        } catch (err) {
            console.warn('Invito non memorizzato:', err);
        }
    }
    return code;
}

export function storedInvite(): string {
    try {
        return normalizeInvite(localStorage.getItem(KEY));
    } catch {
        return '';
    }
}

export function clearInvite() {
    try {
        localStorage.removeItem(KEY);
    } catch (err) {
        console.warn('Invito non rimosso:', err);
    }
}
