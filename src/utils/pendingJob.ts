/**
 * Offerta da riaprire dopo l'iscrizione: chi arriva da /offerte/:id e crea l'account
 * torna sull'annuncio appena finito il benvenuto.
 */
const KEY = 'swimin:offerta';

export function rememberPendingJob(id: string | null) {
    if (!id || !/^[A-Za-z0-9_.-]{1,36}$/.test(id)) return;
    try {
        sessionStorage.setItem(KEY, id);
    } catch (err) {
        console.warn('Offerta non ricordata:', err);
    }
}

/** Indirizzo a cui andare dopo il benvenuto (l'offerta, se c'era, altrimenti la home). */
export function takePendingJobPath(): string {
    try {
        const id = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        return id ? `/jobs/${encodeURIComponent(id)}` : '/';
    } catch (err) {
        console.warn('Offerta non letta:', err);
        return '/';
    }
}
