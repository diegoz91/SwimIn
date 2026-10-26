/**
 * Orari di apertura delle strutture: 7 giorni da lunedì, ognuno '' (non indicato), 'chiuso'
 * o una/due fasce "07:00-13:00,15:00-22:00" (validati anche dalla Function).
 */
export const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const DAYS_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

export type DayRange = { start: string; end: string };
export type DayHours = { closed: boolean; ranges: DayRange[] };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function parseDay(raw?: string | null): DayHours | null {
    const v = (raw || '').trim().toLowerCase();
    if (!v) return null;
    if (v === 'chiuso') return { closed: true, ranges: [] };
    const ranges = v.split(',').map((p) => {
        const [start, end] = p.trim().split('-');
        return { start, end };
    }).filter((r) => /^\d{2}:\d{2}$/.test(r.start) && /^\d{2}:\d{2}$/.test(r.end));
    return ranges.length ? { closed: false, ranges } : null;
}

export const serializeDay = (d: DayHours | null): string => (!d ? '' : d.closed ? 'chiuso' : d.ranges.map((r) => `${r.start}-${r.end}`).join(','));

/** "07:00–13:00 e 15:00–22:00", "Chiuso" o "". */
export function formatDay(raw?: string | null): string {
    const d = parseDay(raw);
    if (!d) return '';
    if (d.closed) return 'Chiuso';
    return d.ranges.map((r) => `${r.start}–${r.end === '24:00' ? '24:00' : r.end}`).join(' e ');
}

export const hasHours = (hours?: string[] | null) => !!hours && hours.length === 7 && hours.some((h) => !!parseDay(h));

/** Indice del giorno da lunedì (0) a domenica (6). */
export const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;

/**
 * Aperto adesso? Restituisce lo stato e la prossima variazione ("chiude alle 22:00",
 * "apre alle 15:00", "apre domani alle 7:00"), oppure null se gli orari non ci sono.
 */
export function openStatus(hours: string[] | null | undefined, now: Date = new Date()): { open: boolean; label: string } | null {
    if (!hasHours(hours)) return null;
    const day = weekdayIndex(now);
    const minutes = now.getHours() * 60 + now.getMinutes();
    const today = parseDay(hours![day]);
    if (today && !today.closed) {
        for (const r of today.ranges) {
            if (minutes >= toMin(r.start) && minutes < toMin(r.end)) return { open: true, label: `Aperto · chiude alle ${r.end}` };
        }
        const next = today.ranges.find((r) => toMin(r.start) > minutes);
        if (next) return { open: false, label: `Chiuso · apre alle ${next.start}` };
    }
    for (let i = 1; i <= 7; i++) {
        const d = parseDay(hours![(day + i) % 7]);
        if (d && !d.closed && d.ranges.length) {
            const when = i === 1 ? 'domani' : DAYS[(day + i) % 7].toLowerCase();
            return { open: false, label: `Chiuso · apre ${when} alle ${d.ranges[0].start}` };
        }
    }
    return { open: false, label: 'Chiuso' };
}
