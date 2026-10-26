import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { MONTHS, todayISO } from '@/utils/dates';
import { addMonths, monthGrid } from '@/utils/shiftCalendar';
import type { ShiftItem } from './ShiftWeek';

const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const WEEKDAYS_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const wd = (new Date(y, m - 1, d).getDay() + 6) % 7;
    return `${WEEKDAYS_LONG[wd]} ${d} ${MONTHS[m - 1]}`;
};

/**
 * Mese dei turni: ogni giorno mostra un pallino per turno, del colore della struttura.
 * Si sceglie un giorno e sotto compaiono i suoi turni (li disegna chi usa il componente).
 */
export const ShiftMonth: React.FC<{
    shifts: ShiftItem[];
    month: string;
    onMonthChange: (month: string) => void;
    selected: string;
    onSelect: (iso: string) => void;
    dotOf: (s: ShiftItem) => string;
    flagged?: Set<string>;
}> = ({ shifts, month, onMonthChange, selected, onSelect, dotOf, flagged }) => {
    const today = todayISO();
    const days = monthGrid(month);
    const byDate = new Map<string, ShiftItem[]>();
    for (const s of shifts) if (s.status !== 'declined') byDate.set(s.date, [...(byDate.get(s.date) || []), s]);
    const [y, m] = month.split('-').map(Number);
    const inMonth = shifts.filter((s) => s.date.startsWith(month) && s.status !== 'declined').length;

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-3">
                <button type="button" onClick={() => onMonthChange(addMonths(month, -1))} className="p-2 rounded-full hover:bg-slate-100 text-slate-600" aria-label="Mese precedente">
                    <Icon type="chevron-right" className="w-5 h-5 rotate-180" />
                </button>
                <div className="text-center">
                    <p className="font-semibold text-abisso first-letter:uppercase">{MONTHS[m - 1]} {y}</p>
                    <p className="text-xs text-slate-500">{inMonth === 0 ? 'Nessun turno' : inMonth === 1 ? '1 turno' : `${inMonth} turni`}</p>
                </div>
                <button type="button" onClick={() => onMonthChange(addMonths(month, 1))} className="p-2 rounded-full hover:bg-slate-100 text-slate-600" aria-label="Mese successivo">
                    <Icon type="chevron-right" className="w-5 h-5" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center" aria-hidden="true">
                {WEEKDAYS.map((d) => <span key={d} className="text-xs font-semibold text-slate-500 pb-1">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Giorni di ${MONTHS[m - 1]} ${y}`}>
                {days.map((iso) => {
                    const list = (byDate.get(iso) || []).sort((a, b) => a.shiftTime.localeCompare(b.shiftTime));
                    const outside = !iso.startsWith(month);
                    const isSel = iso === selected;
                    const isToday = iso === today;
                    const warn = list.some((s) => flagged?.has(s.$id));
                    return (
                        <button
                            key={iso}
                            type="button"
                            onClick={() => onSelect(iso)}
                            aria-pressed={isSel}
                            aria-label={`${dayLabel(iso)}${isToday ? ', oggi' : ''}: ${list.length === 0 ? 'nessun turno' : list.length === 1 ? '1 turno' : `${list.length} turni`}${warn ? ', turni sovrapposti' : ''}`}
                            className={`relative min-h-[3.25rem] sm:min-h-[4.5rem] rounded-xl border p-1 sm:p-1.5 flex flex-col items-center sm:items-start gap-1 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 ${
                                isSel ? 'border-corsia-600 bg-corsia-50' : isToday ? 'border-corsia-300 bg-white' : outside ? 'border-transparent bg-piastrella' : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                        >
                            <span className={`text-sm leading-none ${isToday ? 'font-bold text-corsia-700' : outside ? 'font-medium text-slate-500' : 'font-semibold text-abisso'}`}>{Number(iso.slice(8, 10))}</span>
                            {list.length > 0 && (
                                <>
                                    {/* Telefono: pallini colorati. Schermi larghi: l'orario di inizio. */}
                                    <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                                        {list.slice(0, 3).map((s) => <span key={s.$id} className={`w-1.5 h-1.5 rounded-full ${dotOf(s)}`} />)}
                                    </span>
                                    <span className="hidden sm:flex flex-col gap-0.5 w-full min-w-0">
                                        {list.slice(0, 2).map((s) => (
                                            <span key={s.$id} className="flex items-center gap-1 min-w-0 text-[11px] text-slate-600">
                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotOf(s)}`} />
                                                <span className="truncate">{s.shiftTime.split(/[–-]/)[0]}</span>
                                            </span>
                                        ))}
                                        {list.length > 2 && <span className="text-[11px] text-slate-500">+{list.length - 2}</span>}
                                    </span>
                                </>
                            )}
                            {warn && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export { dayLabel as shiftDayLabel };
