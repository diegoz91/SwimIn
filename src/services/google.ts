import { OAuthProvider, type Models } from 'appwrite';
import { account } from '@/services/appwrite';
import type { IcsEvent } from '@/utils/ics';

/**
 * Integrazione Google, tutta tramite Appwrite (nessuna chiave nel client):
 * - accesso e iscrizione con l'account Google (OAuth2 di Appwrite, flusso a token: funziona anche
 *   se Appwrite è su un dominio diverso da quello dell'app, senza cookie di terze parti);
 * - Google Calendar: chi collega Google con il permesso del calendario salva turni ed eventi
 *   direttamente nel proprio calendario; gli altri li aprono già compilati in Google Calendar.
 *
 * Configurazione (una volta): docs/SETUP-APPWRITE.md, sezione "Google".
 */
export const googleAuthEnabled = import.meta.env.VITE_GOOGLE_AUTH !== 'off';
/** Salvataggio diretto nel calendario (permesso "calendar.events"); con "off" resta il link precompilato. */
export const googleCalendarApiEnabled = googleAuthEnabled && import.meta.env.VITE_GOOGLE_CALENDAR_API !== 'off';

const LOGIN_SCOPES = ['openid', 'email', 'profile'];
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export type GoogleIntent = 'login' | 'register' | 'calendar' | 'link';
export interface GoogleReturn {
    state: string;
    intent: GoogleIntent;
    /** Pagina a cui tornare dopo Google. */
    returnTo: string;
    /** Iscrizione: tipo di account scelto prima di andare su Google. */
    choice?: 'lavoro' | 'passione' | 'struttura';
    /** Calendario: eventi da salvare al ritorno. */
    events?: IcsEvent[];
}

const RETURN_KEY = 'swimin:google';
export const CALLBACK_PATH = '/accesso/google';

const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Va su Google; al ritorno la pagina /accesso/google conclude l'operazione. */
export function startGoogle(opts: { intent: GoogleIntent; returnTo?: string; choice?: GoogleReturn['choice']; events?: IcsEvent[] }) {
    const state = randomState();
    const pending: GoogleReturn = { state, intent: opts.intent, returnTo: opts.returnTo || '/', choice: opts.choice, events: opts.events };
    try {
        sessionStorage.setItem(RETURN_KEY, JSON.stringify(pending));
    } catch (err) {
        console.warn('Google: memoria della sessione non disponibile', err);
    }
    const origin = window.location.origin;
    account.createOAuth2Token({
        provider: OAuthProvider.Google,
        success: `${origin}${CALLBACK_PATH}`,
        failure: `${origin}${CALLBACK_PATH}?errore=1`,
        scopes: opts.intent === 'calendar' ? [...LOGIN_SCOPES, CALENDAR_SCOPE] : LOGIN_SCOPES,
        state,
    });
}

/** Legge (e cancella) l'operazione Google in corso; null se lo stato non coincide (link non partito da qui). */
export function takeGoogleReturn(state: string | null): GoogleReturn | null {
    let pending: GoogleReturn | null = null;
    try {
        pending = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null');
        sessionStorage.removeItem(RETURN_KEY);
    } catch {
        pending = null;
    }
    if (!pending || !state || pending.state !== state) return null;
    // Solo percorsi interni: niente reindirizzamenti verso altri siti.
    if (!pending.returnTo.startsWith('/') || pending.returnTo.startsWith('//')) pending.returnTo = '/';
    return pending;
}

/** Identità Google collegata all'account (con il token di accesso di Google), se c'è. */
export async function googleIdentity(): Promise<Models.Identity | null> {
    try {
        const { identities } = await account.listIdentities();
        return identities.find((i) => i.provider === 'google') || null;
    } catch (err) {
        console.warn('Identità collegate:', err);
        return null;
    }
}

export async function unlinkGoogle(identityId: string) {
    await account.deleteIdentity({ identityId });
}

const scopeCache = new Map<string, boolean>();

/** Token Google valido e con il permesso del calendario, oppure null. */
export async function calendarToken(): Promise<string | null> {
    if (!googleCalendarApiEnabled) return null;
    const id = await googleIdentity();
    const token = id?.providerAccessToken;
    if (!token) return null;
    const expiry = id.providerAccessTokenExpiry ? new Date(id.providerAccessTokenExpiry).getTime() : 0;
    if (expiry && expiry < Date.now() + 60_000) return null;
    if (!scopeCache.has(token)) {
        try {
            const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
            const info = res.ok ? ((await res.json()) as { scope?: string }) : {};
            scopeCache.set(token, (info.scope || '').split(' ').includes(CALENDAR_SCOPE));
        } catch (err) {
            console.warn('Google: verifica del permesso non riuscita', err);
            return null;
        }
    }
    return scopeCache.get(token) ? token : null;
}

/** Id stabile per Google Calendar (caratteri 0-9a-v): salvare due volte lo stesso turno lo aggiorna. */
export const googleEventId = (uid: string) =>
    `swimin${Array.from(new TextEncoder().encode(uid), (b) => b.toString(16).padStart(2, '0')).join('')}`.slice(0, 1000);

const toGoogleEvent = (e: IcsEvent) => ({
    id: googleEventId(e.uid),
    summary: e.title,
    location: e.location || undefined,
    description: e.description || undefined,
    start: { dateTime: `${e.date}T${e.start}:00`, timeZone: 'Europe/Rome' },
    end: { dateTime: `${e.date}T${e.end}:00`, timeZone: 'Europe/Rome' },
    source: { title: 'SwimIn', url: window.location.origin },
});

/** Salva gli eventi nel calendario principale; se esistono già (stesso id) li aggiorna. Restituisce il link dell'ultimo. */
export async function insertCalendarEvents(token: string, events: IcsEvent[]): Promise<string | null> {
    const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    let link: string | null = null;
    for (const e of events) {
        const body = toGoogleEvent(e);
        let res = await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) });
        if (res.status === 409) res = await fetch(`${base}/${body.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'google_auth' : `Google Calendar ha risposto ${res.status}.`);
        link = ((await res.json()) as { htmlLink?: string }).htmlLink || link;
    }
    return link;
}

/** Link "aggiungi a Google Calendar" già compilato (non serve collegare l'account). */
export function googleCalendarTemplateUrl(e: IcsEvent): string {
    const stamp = (time: string) => `${e.date.replace(/-/g, '')}T${time.replace(':', '')}00`;
    const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${stamp(e.start)}/${stamp(e.end)}`, ctz: 'Europe/Rome' });
    if (e.description) p.set('details', e.description);
    if (e.location) p.set('location', e.location);
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
