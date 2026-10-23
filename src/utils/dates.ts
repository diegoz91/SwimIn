/** Date "di calendario" (senza fuso orario) come stringhe ISO: `YYYY-MM-DD` e `YYYY-MM`. */
import type { Experience } from '@/types/types';

const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = (now: Date = new Date()) => toISODate(now);
export const currentMonth = (now: Date = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

export const addDaysISO = (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return toISODate(new Date(y, m - 1, d + days));
};

export function isValidISODate(v: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!match) return false;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(y, m - 1, d);
    return y >= 1900 && y <= 2200 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export const isValidMonth = (v: string) => /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(v);

export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "2020-09" -> "set 2020" */
export const formatMonth = (v?: string | null) => {
    if (!v || !isValidMonth(v)) return '';
    const [y, m] = v.split('-').map(Number);
    return `${MONTHS_SHORT[m - 1]} ${y}`;
};

/** "2026-10-23" -> "23 ottobre 2026" (o "ven 23 ott" in forma breve). */
export function formatDate(v?: string | null, style: 'long' | 'short' | 'weekday' = 'long'): string {
    if (!v) return '';
    if (!isValidISODate(v)) return v; // dati vecchi in testo libero
    const [y, m, d] = v.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (style === 'weekday') return date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
    if (style === 'short') return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Mesi tra due `YYYY-MM`, estremi inclusi (set–set = 1 mese). */
export function monthsBetween(start: string, end: string): number {
    const [y1, m1] = start.split('-').map(Number);
    const [y2, m2] = end.split('-').map(Number);
    return Math.max(0, (y2 - y1) * 12 + (m2 - m1) + 1);
}

/** 26 -> "2 anni e 2 mesi" */
export function formatDuration(months: number): string {
    const y = Math.floor(months / 12);
    const m = months % 12;
    const parts = [y ? `${y} ${y === 1 ? 'anno' : 'anni'}` : '', m ? `${m} ${m === 1 ? 'mese' : 'mesi'}` : ''].filter(Boolean);
    return parts.join(' e ') || 'meno di un mese';
}

/** Periodo leggibile di un'esperienza: "set 2020 – oggi · 6 anni e 2 mesi" (o il vecchio testo libero). */
export function experiencePeriod(exp: Experience, now: Date = new Date()): string {
    if (!exp.startDate || !isValidMonth(exp.startDate)) return exp.period || '';
    const end = exp.current || !exp.endDate ? currentMonth(now) : exp.endDate;
    const range = `${formatMonth(exp.startDate)} – ${exp.current || !exp.endDate ? 'oggi' : formatMonth(exp.endDate)}`;
    return `${range} · ${formatDuration(monthsBetween(exp.startDate, end))}`;
}

/** Prima le esperienze in corso, poi dalla più recente; quelle col vecchio formato in fondo. */
export function sortExperiences<T extends Experience>(list: T[]): T[] {
    const key = (e: Experience) => (e.current ? '9999-99' : e.endDate || e.startDate || '0000-00');
    return [...list].sort((a, b) => key(b).localeCompare(key(a)) || (b.startDate || '').localeCompare(a.startDate || ''));
}

/** Anni complessivi di esperienza (periodi sovrapposti contati una volta). */
export function totalExperienceMonths(list: Experience[], now: Date = new Date()): number {
    const months = new Set<string>();
    for (const e of list) {
        if (!e.startDate || !isValidMonth(e.startDate)) continue;
        const end = e.current || !e.endDate ? currentMonth(now) : e.endDate;
        let [y, m] = e.startDate.split('-').map(Number);
        const [ye, me] = end.split('-').map(Number);
        let guard = 0;
        while ((y < ye || (y === ye && m <= me)) && guard++ < 1200) {
            months.add(`${y}-${m}`);
            m++;
            if (m > 12) { m = 1; y++; }
        }
    }
    return months.size;
}

/** Turno "HH:MM–HH:MM" (o testo libero dei dati vecchi). */
export const formatShift = (start?: string, end?: string) => (start && end ? `${start}–${end}` : start || end || '');
