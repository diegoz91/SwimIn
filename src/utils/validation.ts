/**
 * Regole di validazione dei form. Ogni regola restituisce il messaggio d'errore
 * (in italiano) oppure `undefined` se il valore è valido; i valori vuoti sono
 * considerati validi da tutte le regole tranne `required`, così i campi
 * facoltativi si controllano solo quando vengono compilati.
 */
import { isProvinceCode } from '@/data/italy';
import { isValidISODate, isValidMonth } from '@/utils/dates';
import { normalizeText } from '@/utils/text';

export type Rule = (value: string) => string | undefined;

const empty = (v: string | undefined | null) => !v || !v.trim();

/** Primo errore tra le regole indicate. */
export const check = (value: string | undefined | null, ...rules: Rule[]): string | undefined => {
    const v = value ?? '';
    for (const rule of rules) {
        const error = rule(v);
        if (error) return error;
    }
    return undefined;
};

export const required = (message = 'Campo obbligatorio.'): Rule => (v) => (empty(v) ? message : undefined);

export const minLength = (min: number, message?: string): Rule => (v) =>
    !empty(v) && v.trim().length < min ? message || `Scrivi almeno ${min} caratteri.` : undefined;

export const maxLength = (max: number, message?: string): Rule => (v) =>
    v.trim().length > max ? message || `Massimo ${max} caratteri (ora ${v.trim().length}).` : undefined;

/** Nomi di persona: lettere (anche accentate), apostrofi, trattini e spazi. */
export const personName: Rule = (v) => {
    if (empty(v)) return undefined;
    if (!/^[\p{L}][\p{L}\p{M}'’\- .]*$/u.test(v.trim())) return 'Usa solo lettere, spazi, apostrofi o trattini.';
    return undefined;
};

/** Niente indirizzi, numeri di telefono o email dentro campi descrittivi brevi. */
export const noContactInfo: Rule = (v) =>
    /https?:\/\/|www\.|@\w+\.\w+/i.test(v) ? 'Non inserire link o email in questo campo.' : undefined;

export const email: Rule = (v) =>
    empty(v) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? undefined : 'Indirizzo email non valido.';

/** Numero di telefono italiano o internazionale (+39, 0039 o senza prefisso). */
export const normalizePhone = (v: string) => v.replace(/[\s.\-/()]/g, '');
export const phone: Rule = (v) => {
    if (empty(v)) return undefined;
    const n = normalizePhone(v);
    if (!/^(\+|00)?\d+$/.test(n)) return 'Usa solo cifre, spazi e il prefisso +.';
    const national = n.replace(/^(\+|00)39/, '');
    const international = /^(\+|00)/.test(n) && !/^(\+|00)39/.test(n);
    const digits = international ? n.replace(/^(\+|00)/, '') : national;
    if (international ? digits.length < 7 || digits.length > 15 : digits.length < 6 || digits.length > 11) return 'Numero di telefono non valido.';
    if (!international && !/^[03]/.test(national)) return 'I numeri italiani iniziano con 0 (fisso) o 3 (cellulare).';
    return undefined;
};

/** Aggiunge https:// se manca. */
export const normalizeUrl = (v: string) => {
    const t = v.trim();
    if (!t) return '';
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};
export const url: Rule = (v) => {
    if (empty(v)) return undefined;
    try {
        const u = new URL(normalizeUrl(v));
        if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || /\s/.test(v.trim())) throw new Error('url');
        return undefined;
    } catch {
        return 'Indirizzo web non valido (es. www.piscina.it).';
    }
};

export const province: Rule = (v) => (empty(v) || isProvinceCode(v) ? undefined : 'Scegli una provincia dall’elenco.');

export const postalCode: Rule = (v) => (empty(v) || /^\d{5}$/.test(v.trim()) ? undefined : 'Il CAP è formato da 5 cifre.');

/** Partita IVA italiana: 11 cifre con cifra di controllo. */
export const vatNumber: Rule = (v) => {
    if (empty(v)) return undefined;
    const n = v.trim().replace(/^IT/i, '').replace(/\s/g, '');
    if (!/^\d{11}$/.test(n)) return 'La partita IVA è formata da 11 cifre.';
    let sum = 0;
    for (let i = 0; i < 10; i++) {
        let d = Number(n[i]);
        if (i % 2 === 1) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
    }
    return (10 - (sum % 10)) % 10 === Number(n[10]) ? undefined : 'Partita IVA non valida: controlla le cifre.';
};

export const integerBetween = (min: number, max: number, message?: string): Rule => (v) => {
    if (empty(v)) return undefined;
    if (!/^-?\d+$/.test(v.trim())) return 'Inserisci un numero intero.';
    const n = Number(v);
    return n < min || n > max ? message || `Inserisci un valore tra ${min} e ${max}.` : undefined;
};

export const isoDate: Rule = (v) => (empty(v) || isValidISODate(v) ? undefined : 'Data non valida.');
export const month: Rule = (v) => (empty(v) || isValidMonth(v) ? undefined : 'Indica mese e anno.');

/** Date `YYYY-MM-DD` o `YYYY-MM`: il confronto tra stringhe ISO è cronologico. */
export const notAfter = (limit: string, message: string): Rule => (v) => (!empty(v) && limit && v > limit ? message : undefined);
export const notBefore = (limit: string, message: string): Rule => (v) => (!empty(v) && limit && v < limit ? message : undefined);

/** "HH:MM" */
export const time: Rule = (v) => (empty(v) || /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? undefined : 'Orario non valido.');

// ---------------------------------------------------------------------------

export interface PasswordStrength {
    score: 0 | 1 | 2 | 3 | 4;
    label: string;
    /** Suggerimento per renderla più robusta, se serve. */
    hint?: string;
}

const COMMON_PASSWORDS = ['password', '12345678', '123456789', 'qwertyui', 'qwerty123', 'password1', 'nuoto123', 'swimin123', 'piscina1', 'iloveyou'];

/** Stima semplice della robustezza (lunghezza + varietà di caratteri). */
export function passwordStrength(pw: string, personal: string[] = []): PasswordStrength {
    if (!pw) return { score: 0, label: '' };
    const lower = pw.toLowerCase();
    if (pw.length < 8) return { score: 0, label: 'Troppo corta', hint: 'Servono almeno 8 caratteri.' };
    if (COMMON_PASSWORDS.includes(lower) || /^(.)\1+$/.test(pw)) return { score: 0, label: 'Troppo comune', hint: 'Evita parole o sequenze ovvie.' };
    if (personal.some((p) => p && p.length >= 3 && lower.includes(p.toLowerCase())))
        return { score: 1, label: 'Debole', hint: 'Non usare il tuo nome o la tua email.' };
    const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
    let score = (pw.length >= 12 ? 2 : 1) + (variety >= 3 ? 1 : 0) + (variety === 4 || pw.length >= 16 ? 1 : 0);
    score = Math.min(4, score);
    const labels = ['Troppo debole', 'Debole', 'Discreta', 'Buona', 'Ottima'];
    const hint = score < 3 ? 'Allungala o aggiungi maiuscole, numeri e simboli.' : undefined;
    return { score: score as PasswordStrength['score'], label: labels[score], hint };
}

/** Il comune deve appartenere alla provincia (se l'elenco dei comuni è disponibile). */
export const comuneOf = (comuni: string[], provinceLabel?: string): Rule => (v) => {
    if (empty(v) || !comuni.length) return undefined;
    const n = normalizeText(v);
    const ok = comuni.some((c) => normalizeText(c) === n);
    return ok ? undefined : `Scegli un comune ${provinceLabel ? `della provincia di ${provinceLabel}` : 'dall’elenco'}.`;
};
