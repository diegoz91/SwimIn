import React from 'react';
import type { SquadShift } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { addDaysISO, formatWeek, todayISO } from '@/utils/dates';

const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

export type ShiftItem = SquadShift & { structureName?: string };

export const shiftStatusBadge = (status: SquadShift['status']) =>
    status === 'confirmed'
        ? { text: 'Confermato', cls: 'bg-green-50 text-green-800 border-green-200' }
        : status === 'declined'
          ? { text: 'Da riassegnare', cls: 'bg-red-50 text-red-800 border-red-200' }
          : { text: 'Da confermare', cls: 'bg-slate-100 text-slate-600 border-slate-200' };

/**
 * Settimana di turni: sette colonne su schermo largo, giorni in elenco su mobile.
 * `show` decide se mostrare il nome della persona (vista struttura) o della struttura (i miei turni).
 */
export const ShiftWeek: React.FC<{
    shifts: ShiftItem[];
    weekStart: string;
    onWeekChange: (weekStart: string) => void;
    currentUserId?: string;
    show: 'person' | 'structure';
    actions?: (shift: ShiftItem) => React.ReactNode;
    /** Classe del bordo sinistro colorato (es. colore della struttura nel calendario personale). */
    accentOf?: (shift: ShiftItem) => string | undefined;
    /** Turni che si sovrappongono ad altri dello stesso giorno. */
    flagged?: Set<string>;
}> = ({ shifts, weekStart, onWeekChange, currentUserId, show, actions, accentOf, flagged }) => {
    const today = todayISO();
    const days = DAY_NAMES.map((name, i) => ({ name, date: addDaysISO(weekStart, i) }));
    const inWeek = shifts.filter((s) => s.date >= weekStart && s.date <= addDaysISO(weekStart, 6));

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-3">
                <button type="button" onClick={() => onWeekChange(addDaysISO(weekStart, -7))} className="p-2 rounded-full hover:bg-slate-100 text-slate-600" aria-label="Settimana precedente">
                    <Icon type="chevron-right" className="w-5 h-5 rotate-180" />
                </button>
                <div className="text-center">
                    <p className="font-semibold text-abisso">{formatWeek(weekStart)}</p>
                    <p className="text-xs text-slate-500">{inWeek.length === 0 ? 'Nessun turno' : inWeek.length === 1 ? '1 turno' : `${inWeek.length} turni`}</p>
                </div>
                <button type="button" onClick={() => onWeekChange(addDaysISO(weekStart, 7))} className="p-2 rounded-full hover:bg-slate-100 text-slate-600" aria-label="Settimana successiva">
                    <Icon type="chevron-right" className="w-5 h-5" />
                </button>
            </div>
            <ol className="grid grid-cols-1 lg:grid-cols-7 gap-2">
                {days.map((d) => {
                    const list = inWeek.filter((s) => s.date === d.date).sort((a, b) => a.shiftTime.localeCompare(b.shiftTime));
                    const isToday = d.date === today;
                    return (
                        <li key={d.date} className={`rounded-xl border p-2 min-h-[5rem] ${isToday ? 'border-corsia-300 bg-corsia-50/50' : 'border-slate-200 bg-white'} ${list.length === 0 ? 'hidden lg:block' : ''}`}>
                            <p className={`text-xs font-semibold mb-2 ${isToday ? 'text-corsia-700' : 'text-slate-500'}`}>
                                {d.name} {Number(d.date.slice(8, 10))}{isToday ? ', oggi' : ''}
                            </p>
                            <ul className="space-y-2">
                                {list.map((s) => {
                                    const badge = shiftStatusBadge(s.status);
                                    const mine = s.userId === currentUserId;
                                    return (
                                        <li key={s.$id} className={`rounded-lg border p-2 text-sm ${mine && show === 'person' ? 'border-corsia-300 bg-white' : 'border-slate-200 bg-white'} ${accentOf?.(s) ? `border-l-4 ${accentOf(s)}` : ''}`}>
                                            <p className="font-semibold text-abisso">{s.shiftTime}</p>
                                            <p className="text-slate-700 truncate">{show === 'person' ? s.userName : s.structureName}</p>
                                            <p className="text-xs text-slate-500 truncate">{s.role}</p>
                                            <span className={`inline-block mt-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.text}</span>
                                            {flagged?.has(s.$id) && <span className="inline-block mt-1.5 ml-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">Sovrapposto</span>}
                                            {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions(s)}</div>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </li>
                    );
                })}
            </ol>
            {inWeek.length === 0 && <p className="lg:hidden text-sm text-slate-500 text-center py-6">Nessun turno in questa settimana.</p>}
        </div>
    );
};
