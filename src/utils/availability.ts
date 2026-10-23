/** Disponibilità settimanale dei professionisti: fasce "giorno-momento", es. "lun-mattina". */

export const DAYS = [
    { key: 'lun', short: 'Lun', label: 'Lunedì' },
    { key: 'mar', short: 'Mar', label: 'Martedì' },
    { key: 'mer', short: 'Mer', label: 'Mercoledì' },
    { key: 'gio', short: 'Gio', label: 'Giovedì' },
    { key: 'ven', short: 'Ven', label: 'Venerdì' },
    { key: 'sab', short: 'Sab', label: 'Sabato' },
    { key: 'dom', short: 'Dom', label: 'Domenica' },
] as const;

export const PARTS = [
    { key: 'mattina', label: 'Mattina', hours: '7–13' },
    { key: 'pomeriggio', label: 'Pomeriggio', hours: '13–18' },
    { key: 'sera', label: 'Sera', hours: '18–23' },
] as const;

export type DayKey = (typeof DAYS)[number]['key'];
export type PartKey = (typeof PARTS)[number]['key'];

const VALID = new Set(DAYS.flatMap((d) => PARTS.map((p) => `${d.key}-${p.key}`)));

export const slotKey = (day: DayKey, part: PartKey) => `${day}-${part}`;

/** Tiene solo le fasce valide, senza duplicati, in ordine di calendario. */
export function normalizeAvailability(list?: string[] | null): string[] {
    const set = new Set((list || []).filter((s) => VALID.has(s)));
    return DAYS.flatMap((d) => PARTS.map((p) => slotKey(d.key, p.key))).filter((k) => set.has(k));
}

/** Riassunto breve: "Feriali sera, sabato mattina" / "Tutta la settimana". */
export function summarizeAvailability(list?: string[] | null): string {
    const slots = normalizeAvailability(list);
    if (!slots.length) return '';
    if (slots.length === VALID.size) return 'Tutta la settimana';
    const byPart = PARTS.map((p) => ({ part: p, days: DAYS.filter((d) => slots.includes(slotKey(d.key, p.key))).map((d) => d.key) }));
    const weekdays: DayKey[] = ['lun', 'mar', 'mer', 'gio', 'ven'];
    const describeDays = (days: DayKey[]) => {
        if (days.length === 7) return 'Tutti i giorni';
        const hasWeekdays = weekdays.every((d) => days.includes(d));
        const rest = days.filter((d) => !hasWeekdays || !weekdays.includes(d));
        const names = rest.map((d) => DAYS.find((x) => x.key === d)!.label.toLowerCase());
        return [hasWeekdays ? 'feriali' : '', ...names].filter(Boolean).join(', ');
    };
    const text = byPart
        .filter((b) => b.days.length)
        .map((b) => `${b.part.label.toLowerCase()}: ${describeDays(b.days)}`)
        .join(' · ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

const JS_DAY_TO_KEY: DayKey[] = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/** Fascia della giornata in corso. */
export function currentPart(now: Date = new Date()): PartKey {
    const h = now.getHours();
    return h < 13 ? 'mattina' : h < 18 ? 'pomeriggio' : 'sera';
}

/** Fasce ancora utili oggi: quella in corso e le successive. */
export function remainingSlotsToday(now: Date = new Date()): string[] {
    const day = JS_DAY_TO_KEY[now.getDay()];
    const from = PARTS.findIndex((p) => p.key === currentPart(now));
    return PARTS.slice(from).map((p) => slotKey(day, p.key));
}

export const slotLabel = (slot: string) => {
    const [d, p] = slot.split('-');
    const day = DAYS.find((x) => x.key === d);
    const part = PARTS.find((x) => x.key === p);
    return day && part ? `${day.label.toLowerCase()} ${part.label.toLowerCase()}` : slot;
};
