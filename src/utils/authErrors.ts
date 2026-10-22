import { AppwriteException } from 'appwrite';

/**
 * Traduce gli errori di Appwrite Auth in messaggi comprensibili in italiano.
 * I messaggi originali sono in inglese e spesso tecnici.
 */
export const authErrorMessage = (error: unknown, fallback = 'Si è verificato un errore. Riprova.'): string => {
    if (error instanceof AppwriteException) {
        switch (error.type) {
            case 'user_invalid_credentials':
                return 'Email o password non corretti.';
            case 'user_already_exists':
            case 'user_email_already_exists':
                return 'Esiste già un account con questa email. Prova ad accedere.';
            case 'user_blocked':
                return 'Questo account è stato sospeso. Contatta il supporto.';
            case 'user_password_mismatch':
                return 'Le password non coincidono.';
            case 'password_recently_used':
                return 'Hai già usato questa password di recente: scegline un\'altra.';
            case 'password_personal_data':
                return 'La password non deve contenere nome, email o altri dati personali.';
            case 'user_invalid_token':
                return 'Il link non è valido o è scaduto. Richiedine uno nuovo.';
            case 'user_not_found':
                return 'Nessun account trovato con questi dati.';
            case 'general_argument_invalid':
                if (/password/i.test(error.message)) {
                    return 'La password deve avere almeno 8 caratteri e non essere troppo comune.';
                }
                if (/email/i.test(error.message)) return 'L\'indirizzo email non è valido.';
                break;
            case 'general_rate_limit_exceeded':
                return 'Troppi tentativi ravvicinati. Attendi qualche minuto e riprova.';
        }
        if (error.code === 401) return 'Sessione scaduta: accedi di nuovo.';
        if (error.code === 429) return 'Troppi tentativi ravvicinati. Attendi qualche minuto e riprova.';
    }
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
        return 'Connessione assente. Controlla la rete e riprova.';
    }
    return fallback;
};
