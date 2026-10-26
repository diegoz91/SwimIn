/**
 * Calendario personale dei turni (anche di più strutture): griglia del mese, ore, sovrapposizioni
 * e un colore per ogni struttura. Funzioni pure, testate in __tests__/shiftCalendar.test.ts.
 */
import { addDaysISO, weekStartISO } from '@/utils/dates';

export interface CalendarShift {
    $id: string;
    structureId: string;
    date: string;
    shiftTime: string;
    status: 'scheduled' | 'confirmed' | 'declined';
}

/** "07:00–13:00" (anche con "-" o " – ") → minuti di inizio e fine; null se non leggibile. */
export function shiftRange(shiftTime: string): [number, number] | null {
    const m = /^\s*(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})\s*$/.exec(shiftTime || '');
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (end <= start) end += 24 * 60; // turno che passa la mezzanotte
    return [start, end];
}

/** Ore di un elenco di turni (i rifiutati non contano). */
export function totalHours(shifts: CalendarShift[]): number {
    const minutes = shifts.reduce((sum, s) => {
        if (s.status === 'declined') return sum;
        const r = shiftRange(s.shiftTime);
        return r ? sum + (r[1] - r[0]) : sum;
    }, 0);
    return Math.round((minutes / 60) * 10) / 10;
}

/** "12,5 ore" / "1 ora" */
export const hoursLabel = (h: number) => `${String(h).replace('.', ',')} ${h === 1 ? 'ora' : 'ore'}`;

/** Turni dello stesso giorno che si accavallano (anche in strutture diverse). */
export function overlappingIds(shifts: CalendarShift[]): Set<string> {
    const out = new Set<string>();
    const active = shifts.filter((s) => s.status !== 'declined');
    const byDate = new Map<string, CalendarShift[]>();
    for (const s of active) byDate.set(s.date, [...(byDate.get(s.date) || []), s]);
    for (const list of byDate.values()) {
        for (let i = 0; i < list.length; i++) {
            const a = shiftRange(list[i].shiftTime);
            if (!a) continue;
            for (let j = i + 1; j < list.length; j++) {
                const b = shiftRange(list[j].shiftTime);
                if (b && a[0] < b[1] && b[0] < a[1]) {
                    out.add(list[i].$id);
                    out.add(list[j].$id);
                }
            }
        }
    }
    return out;
}

/** Le 6 settimane (42 giorni, da lunedì) che mostrano il mese "YYYY-MM". */
export function monthGrid(month: string): string[] {
    const start = weekStartISO(`${month}-01`);
    return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
}

export const addMonths = (month: string, n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Colori delle strutture (classi complete, così Tailwind le include). L'oro è riservato a Premium. */
export const STRUCTURE_COLORS = [
    { dot: 'bg-corsia-500', chip: 'bg-corsia-50 border-corsia-200 text-corsia-800', bar: 'border-l-corsia-500' },
    { dot: 'bg-cloro-500', chip: 'bg-cloro-50 border-cloro-200 text-cloro-800', bar: 'border-l-cloro-500' },
    { dot: 'bg-violet-500', chip: 'bg-violet-50 border-violet-200 text-violet-800', bar: 'border-l-violet-500' },
    { dot: 'bg-orange-500', chip: 'bg-orange-50 border-orange-200 text-orange-800', bar: 'border-l-orange-500' },
    { dot: 'bg-pink-500', chip: 'bg-pink-50 border-pink-200 text-pink-800', bar: 'border-l-pink-500' },
    { dot: 'bg-sky-500', chip: 'bg-sky-50 border-sky-200 text-sky-800', bar: 'border-l-sky-500' },
] as const;
export type StructureColor = (typeof STRUCTURE_COLORS)[number];

/** Un colore stabile per struttura, nell'ordine in cui compaiono (prima quelle di `preferred`). */
export function structureColorMap(structureIds: string[], preferred: string[] = []): Map<string, StructureColor> {
    const order = [...new Set([...preferred, ...structureIds])];
    return new Map(order.map((id, i) => [id, STRUCTURE_COLORS[i % STRUCTURE_COLORS.length]]));
}
