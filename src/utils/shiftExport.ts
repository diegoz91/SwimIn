import type { ShiftExportRow } from '@/services/database';

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const STATUS: Record<ShiftExportRow['status'], string> = { scheduled: 'Da confermare', confirmed: 'Confermato', declined: 'Non può' };

/** Campo CSV per Excel in italiano: separatore ";", virgolette solo se servono. */
const cell = (v: string | number) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const hoursIt = (h: number) => (Math.round(h * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 });
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const itDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Totali per persona (i turni "non può" non contano). */
export function shiftTotals(rows: ShiftExportRow[]) {
    const map = new Map<string, { name: string; shifts: number; hours: number }>();
    for (const r of rows) {
        if (r.status === 'declined') continue;
        const t = map.get(r.userId) ?? { name: r.userName, shifts: 0, hours: 0 };
        t.shifts += 1;
        t.hours += r.hours;
        map.set(r.userId, t);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

/**
 * CSV dei turni di un mese per le paghe: elenco dei turni e, sotto, i totali per persona.
 * Apribile direttamente con Excel, Numbers o Fogli (separatore ";", BOM UTF-8, a capo CRLF).
 */
export function buildShiftsCsv(rows: ShiftExportRow[], { structureName, month }: { structureName: string; month: string }): string {
    const lines: (string | number)[][] = [
        [`Turni ${structureName}`, month.slice(5, 7) + '/' + month.slice(0, 4)],
        [],
        ['Data', 'Giorno', 'Persona', 'Ruolo', 'Inizio', 'Fine', 'Ore', 'Stato'],
        ...rows.map((r) => [itDate(r.date), weekday(r.date), r.userName, r.role, r.start, r.end, hoursIt(r.hours), STATUS[r.status] || r.status]),
        [],
        ['Totale per persona', '', 'Turni', 'Ore'],
    ];
    const totals = shiftTotals(rows);
    for (const t of totals) lines.push([t.name, '', t.shifts, hoursIt(t.hours)]);
    lines.push(['Totale', '', totals.reduce((n, t) => n + t.shifts, 0), hoursIt(totals.reduce((n, t) => n + t.hours, 0))]);
    return '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** Scarica un testo come file (nessun servizio esterno). */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
