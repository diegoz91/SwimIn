import React from 'react';
import { Select, TimePicker } from '@/components/form/Pickers';
import { Icon } from '@/components/ui/Icon';
import { DAYS, parseDay, serializeDay, type DayHours } from '@/utils/openingHours';

type Mode = '' | 'chiuso' | 'aperto';
const EMPTY = ['', '', '', '', '', '', ''];
const valid = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Problemi di un giorno (fine prima dell'inizio, fasce sovrapposte), o null. */
export function dayError(raw: string): string | null {
    const d = parseDay(raw);
    if (!raw || !d || d.closed) return raw && !d ? 'Completa gli orari.' : null;
    if (d.ranges.some((r) => !valid(r.start) || !valid(r.end))) return 'Completa gli orari.';
    if (d.ranges.some((r) => r.end <= r.start)) return 'La chiusura deve essere dopo l’apertura.';
    if (d.ranges[1] && d.ranges[1].start < d.ranges[0].end) return 'La seconda fascia inizia prima della fine della prima.';
    return null;
}

/**
 * Orari di apertura giorno per giorno: non indicato, chiuso, oppure una fascia con una pausa
 * facoltativa (es. 07:00–13:00 e 15:00–22:00). Il valore è l'elenco di 7 stringhe salvato sul profilo.
 */
export const OpeningHoursEditor: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
    const days = value.length === 7 ? value : EMPTY;
    const setDay = (i: number, d: DayHours | null | string) => onChange(days.map((x, j) => (j === i ? (typeof d === 'string' ? d : serializeDay(d)) : x)));

    const modeOf = (raw: string): Mode => (!raw ? '' : raw === 'chiuso' ? 'chiuso' : 'aperto');
    const draftOf = (raw: string): DayHours => {
        const d = parseDay(raw);
        if (d && !d.closed) return d;
        // Bozza: orari parziali mentre si scrive ("07:00-" non è ancora valido).
        const parts = raw && raw !== 'chiuso' ? raw.split(',').map((p) => { const [start = '', end = ''] = p.split('-'); return { start, end }; }) : [{ start: '', end: '' }];
        return { closed: false, ranges: parts };
    };
    const write = (i: number, d: DayHours) => setDay(i, d.ranges.map((r) => `${r.start}-${r.end}`).join(','));

    const copyMonday = () => {
        const mon = days[0];
        onChange(days.map((x, i) => (i > 0 && i < 5 ? mon : x)));
    };

    return (
        <div className="space-y-3">
            {days.map((raw, i) => {
                const mode = modeOf(raw);
                const d = mode === 'aperto' ? draftOf(raw) : null;
                const err = dayError(raw);
                return (
                    <div key={DAYS[i]} className="rounded-2xl border border-slate-200 p-3 sm:p-4">
                        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[8rem_12rem_minmax(0,1fr)] gap-3 items-center">
                            <span className="font-semibold text-abisso">{DAYS[i]}</span>
                            <Select
                                size="sm"
                                label={`${DAYS[i]}: apertura`}
                                value={mode}
                                onChange={(m) => setDay(i, m === 'chiuso' ? 'chiuso' : m === 'aperto' ? '07:00-22:00' : '')}
                                options={[{ value: '', label: 'Non indicato' }, { value: 'aperto', label: 'Aperto' }, { value: 'chiuso', label: 'Chiuso' }]}
                            />
                            {d && (
                                <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-2">
                                    {d.ranges.map((r, k) => (
                                        <div key={k} className="flex items-center gap-2">
                                            {k === 1 && <span className="text-sm text-slate-500">e</span>}
                                            <div className="w-24"><TimePicker label={`${DAYS[i]}: apre`} value={r.start} onChange={(v) => write(i, { ...d, ranges: d.ranges.map((x, j) => (j === k ? { ...x, start: v } : x)) })} /></div>
                                            <span className="text-slate-500" aria-hidden="true">–</span>
                                            <div className="w-24"><TimePicker label={`${DAYS[i]}: chiude`} after={r.start} value={r.end} onChange={(v) => write(i, { ...d, ranges: d.ranges.map((x, j) => (j === k ? { ...x, end: v } : x)) })} /></div>
                                            {k === 1 && (
                                                <button type="button" onClick={() => write(i, { ...d, ranges: [d.ranges[0]] })} className="w-8 h-8 rounded-full grid place-items-center text-slate-500 hover:text-galleggiante-700 hover:bg-red-50" aria-label={`${DAYS[i]}: togli la seconda fascia`}>
                                                    <Icon type="x" className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {d.ranges.length === 1 && (
                                        <button type="button" onClick={() => write(i, { ...d, ranges: [d.ranges[0], { start: '15:00', end: '22:00' }] })} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">
                                            Aggiungi pausa
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        {err && <p className="mt-2 text-sm text-galleggiante-700">{err}</p>}
                    </div>
                );
            })}
            {days[0] && (
                <button type="button" onClick={copyMonday} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">
                    Usa gli orari del lunedì da martedì a venerdì
                </button>
            )}
        </div>
    );
};
