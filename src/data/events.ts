import type { IconType } from '@/components/ui/Icon';
import type { EventType, SwimMeet } from '@/types/types';
import { downloadIcs, type IcsEvent } from '@/utils/ics';

/** Tipi di evento (allineati a EVENT_TYPES in functions/api/src/events.js). */
export const EVENT_TYPES: { value: EventType; label: string; icon: IconType }[] = [
    { value: 'allenamento', label: 'Allenamento', icon: 'users' },
    { value: 'gara', label: 'Gara', icon: 'star' },
    { value: 'corso', label: 'Corso', icon: 'certificate' },
    { value: 'open_day', label: 'Open day', icon: 'building' },
    { value: 'webinar', label: 'Webinar', icon: 'video' },
    { value: 'incontro', label: 'Incontro', icon: 'chat-bubble' },
    { value: 'altro', label: 'Altro', icon: 'calendar' },
];

export const eventTypeOf = (t?: string | null) => EVENT_TYPES.find((x) => x.value === t) || EVENT_TYPES.find((x) => x.value === 'incontro')!;

export const priceLabel = (price?: number | null) => (price && price > 0 ? `${price.toLocaleString('it-IT')} €` : 'Gratuito');

export const timeRange = (e: Pick<SwimMeet, 'time' | 'endTime'>) => (e.endTime ? `${e.time}–${e.endTime}` : e.time);

/** Giorno e mese brevi per il riquadro calendario. */
export function dateTile(date: string) {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return {
        day: String(d || ''),
        month: dt.toLocaleDateString('it-IT', { month: 'short' }).replace('.', ''),
        weekday: dt.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', ''),
    };
}

export const seatsLeft = (e: Pick<SwimMeet, 'maxParticipants' | 'participants'>) =>
    e.maxParticipants ? Math.max(0, e.maxParticipants - (e.participants || []).length) : null;

/** L'evento come appuntamento di calendario (ora italiana); senza ora di fine dura 1 ora e mezza. */
export function eventIcs(e: SwimMeet): IcsEvent {
    const [h, m] = e.time.split(':').map(Number);
    const t = Math.min(h * 60 + m + 90, 23 * 60 + 59);
    const end = e.endTime || `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    const url = `${window.location.origin}/eventi/${e.$id}`;
    return {
        uid: `evento-${e.$id}`,
        title: e.title,
        date: e.date,
        start: e.time,
        end,
        location: e.isOnline ? e.onlineUrl || 'Online' : [e.address, e.city].filter(Boolean).join(', '),
        description: `${e.description}\n\n${url}`,
    };
}

export const eventIcsFilename = (e: SwimMeet) => e.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'evento';

/** Scarica l'evento come file .ics. */
export function downloadEventIcs(e: SwimMeet) {
    downloadIcs(eventIcsFilename(e), [eventIcs(e)]);
}
