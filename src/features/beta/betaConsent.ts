import { BETA_VERSION } from '@/config/legal';

/** Le condizioni della fase di test (anche in Termini › Fase di test). */
export const BETA_TERMS: { title: string; text: string }[] = [
    { title: 'È una versione di prova', text: 'SwimIn è in fase di test, riservata a un gruppo ristretto di persone invitate. Può contenere errori, cambiare o fermarsi in qualsiasi momento, anche senza preavviso.' },
    { title: 'I dati possono sparire', text: 'Profili, messaggi, post e tutto ciò che inserisci potrebbero essere modificati o cancellati durante il test o prima del lancio. Tieni una copia di ciò che ti serve.' },
    { title: 'Inserisci solo ciò che vuoi condividere', text: 'Non inserire dati sensibili (salute, documenti d’identità, dati bancari) né dati di altre persone senza il loro consenso. Puoi usare dati di prova.' },
    { title: 'Offerte e turni sono di prova', text: 'Annunci, candidature, turni ed eventi pubblicati in questa fase servono a provare l’app: non sono offerte né impegni reali, salvo accordi presi direttamente tra le persone interessate.' },
    { title: 'Responsabilità', text: 'Nei limiti consentiti dalla legge, SwimIn non risponde di danni derivanti dall’uso della versione di prova, dalla perdita di dati o dai contenuti inseriti dagli utenti, di cui risponde chi li pubblica.' },
    { title: 'I tuoi dati restano tuoi', text: 'Trattiamo i dati personali come descritto nella Privacy Policy: puoi scaricarli o chiederne la cancellazione in qualsiasi momento dalle impostazioni.' },
];


/** Condizioni della fase di test accettate su questo dispositivo (versione dei testi). */
const KEY = 'swimin:beta';
/** Già registrate sul server per l'account in questa sessione. */
const SENT = 'swimin:beta-sent';

export function betaAccepted(): boolean {
    try {
        return localStorage.getItem(KEY) === BETA_VERSION;
    } catch {
        return false;
    }
}

export function rememberBetaAccepted() {
    try {
        localStorage.setItem(KEY, BETA_VERSION);
    } catch (err) {
        console.warn('Accettazione non memorizzata:', err);
    }
}

export function betaSentFor(userId: string): boolean {
    try {
        return sessionStorage.getItem(SENT) === `${userId}:${BETA_VERSION}`;
    } catch {
        return false;
    }
}

export function markBetaSent(userId: string) {
    try {
        sessionStorage.setItem(SENT, `${userId}:${BETA_VERSION}`);
    } catch (err) {
        console.warn('Stato non memorizzato:', err);
    }
}
