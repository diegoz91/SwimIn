import React, { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { ChoiceChips, Field, fieldClass } from '@/components/form/Field';
import { DatePicker, Select, TimePicker } from '@/components/form/Pickers';
import { databaseService, type TeamMember } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { addDaysISO, isValidISODate, todayISO } from '@/utils/dates';
import type { SquadShift } from '@/types/types';

const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const weekdayOf = (iso: string) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;

type Repeat = 'once' | 'weekly';
type Values = { userId: string; repeat: Repeat; date: string; from: string; to: string; weekdays: string[]; start: string; end: string; role: string };
const EMPTY: Values = { userId: '', repeat: 'once', date: '', from: '', to: '', weekdays: [], start: '', end: '', role: '' };

/** Quanti turni crea una serie (stesso calcolo della Function). */
export function countSeries(from: string, to: string, weekdays: number[]): number {
    if (!isValidISODate(from) || !isValidISODate(to) || to < from || !weekdays.length) return 0;
    let n = 0;
    for (let d = from; d <= to; d = addDaysISO(d, 1)) if (weekdays.includes(weekdayOf(d))) n += 1;
    return n;
}

/**
 * Assegna un turno o una serie che si ripete ogni settimana (es. lunedì e mercoledì 9–12 fino
 * a fine mese). La persona riceve un solo avviso per tutta la serie.
 */
export const ShiftCreateModal: React.FC<{ open: boolean; structureId: string; staff: TeamMember[]; defaultDate?: string; onClose: () => void; onCreated: (shifts: SquadShift[]) => void }> = ({ open, structureId, staff, defaultDate, onClose, onCreated }) => {
    const { showToast } = useToast();
    const [v, setV] = useState<Values>(EMPTY);
    const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        const start = defaultDate && defaultDate >= todayISO() ? defaultDate : todayISO();
        setV({ ...EMPTY, date: start, from: start, to: addDaysISO(start, 27) });
        setErrors({});
    }, [open, defaultDate]);

    const days = useMemo(() => v.weekdays.map(Number), [v.weekdays]);
    const count = v.repeat === 'weekly' ? countSeries(v.from, v.to, days) : 1;
    const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((x) => ({ ...x, [k]: val }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const today = todayISO();
        const max = addDaysISO(today, 180);
        const err: typeof errors = {};
        if (!v.userId) err.userId = 'Scegli chi coprirà il turno.';
        if (v.repeat === 'once') {
            if (!isValidISODate(v.date)) err.date = 'Data non valida: usa il formato gg/mm/aaaa.';
            else if (v.date < today) err.date = 'La data è già passata.';
            else if (v.date > max) err.date = 'Massimo 6 mesi in anticipo.';
        } else {
            if (!days.length) err.weekdays = 'Scegli almeno un giorno.';
            if (!isValidISODate(v.from)) err.from = 'Data non valida.';
            else if (v.from < today) err.from = 'La data è già passata.';
            if (!isValidISODate(v.to)) err.to = 'Data non valida.';
            else if (v.to > max) err.to = 'Massimo 6 mesi da oggi.';
            else if (v.to < v.from) err.to = 'Deve essere dopo la data di inizio.';
            if (!err.weekdays && !err.from && !err.to && count === 0) err.weekdays = 'Nel periodo non c’è nessuno dei giorni scelti.';
            if (count > 90) err.to = 'Al massimo 90 turni per volta: accorcia il periodo.';
        }
        if (!validTime(v.start)) err.start = 'Indica l’inizio.';
        if (!validTime(v.end)) err.end = 'Indica la fine.';
        else if (v.start && v.end <= v.start) err.end = 'La fine deve essere dopo l’inizio.';
        setErrors(err);
        if (Object.keys(err).length) return;
        setBusy(true);
        try {
            const shiftTime = `${v.start}–${v.end}`;
            if (v.repeat === 'once') {
                const one = await databaseService.createSquadShift({ structureId, userId: v.userId, date: v.date, shiftTime, role: v.role });
                onCreated([one]);
                showToast('Turno assegnato: abbiamo avvisato la persona.', 'success');
            } else {
                const { created } = await databaseService.createShiftSeries({ structureId, userId: v.userId, startDate: v.from, endDate: v.to, weekdays: days, shiftTime, role: v.role });
                onCreated(created);
                showToast(`${created.length} turni assegnati: la persona riceve un solo avviso.`, 'success');
            }
            onClose();
        } catch (er) {
            showToast(er instanceof Error ? er.message : 'Non è stato possibile salvare.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const dirty = !!(v.userId || v.start || v.end || v.weekdays.length);

    return (
        <FormModal open={open} title="Assegna turni" icon="calendar" submitLabel={v.repeat === 'weekly' && count > 1 ? `Assegna ${count} turni` : 'Assegna'} busy={busy} dirty={dirty} onClose={onClose} onSubmit={submit}>
            {staff.length === 0 ? (
                <p className="text-sm text-amber-900 bg-amber-50 p-3 rounded-xl border border-amber-200">Non ci sono ancora membri dello staff: invita qualcuno dalla scheda Squadra o assumi da un annuncio.</p>
            ) : (
                <>
                    <Field id="shift-new-user" label="Chi lo copre" error={errors.userId}>
                        <Select
                            label="Chi lo copre"
                            value={v.userId}
                            onChange={(id) => { const s = staff.find((x) => x.userId === id); setV((x) => ({ ...x, userId: id, role: x.role || s?.title || '' })); }}
                            options={staff.map((s) => ({ value: s.userId, label: `${s.firstName} ${s.lastName}`.trim() || 'Membro dello staff', hint: s.title }))}
                        />
                    </Field>
                    <div>
                        <p className="text-sm font-semibold text-abisso mb-2">Ripetizione</p>
                        <ChoiceChips<Repeat> label="Ripetizione" options={[{ value: 'once', label: 'Una volta' }, { value: 'weekly', label: 'Ogni settimana' }]} value={[v.repeat]} onChange={(x) => set('repeat', x[0] || 'once')} />
                    </div>
                    {v.repeat === 'once' ? (
                        <Field id="shift-new-date" label="Data" error={errors.date}>
                            <DatePicker label="Data del turno" min={todayISO()} max={addDaysISO(todayISO(), 180)} value={v.date} onChange={(d) => set('date', d)} />
                        </Field>
                    ) : (
                        <>
                            <div>
                                <p className="text-sm font-semibold text-abisso mb-2">Giorni</p>
                                <ChoiceChips label="Giorni della settimana" multiple options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} value={v.weekdays} onChange={(x) => set('weekdays', x)} />
                                {errors.weekdays && <p className="mt-1.5 text-sm text-galleggiante-700">{errors.weekdays}</p>}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field id="shift-new-from" label="Dal" error={errors.from}>
                                    <DatePicker label="Primo giorno" min={todayISO()} max={addDaysISO(todayISO(), 180)} value={v.from} onChange={(d) => set('from', d)} />
                                </Field>
                                <Field id="shift-new-to" label="Al" error={errors.to}>
                                    <DatePicker label="Ultimo giorno" min={v.from || todayISO()} max={addDaysISO(todayISO(), 180)} value={v.to} onChange={(d) => set('to', d)} />
                                </Field>
                            </div>
                        </>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <Field id="shift-new-start" label="Inizio" error={errors.start}>
                            <TimePicker label="Inizio del turno" value={v.start} onChange={(t) => set('start', t)} />
                        </Field>
                        <Field id="shift-new-end" label="Fine" error={errors.end}>
                            <TimePicker label="Fine del turno" after={v.start} value={v.end} onChange={(t) => set('end', t)} />
                        </Field>
                    </div>
                    <Field id="shift-new-role" label="Mansione" optional>
                        <input value={v.role} onChange={(e) => set('role', e.target.value)} maxLength={100} placeholder="Es. Assistente bagnanti" className={fieldClass()} />
                    </Field>
                    {v.repeat === 'weekly' && count > 0 && (
                        <p className="text-sm text-slate-600 bg-piastrella rounded-xl px-4 py-3" aria-live="polite">
                            Verranno creati <span className="font-semibold text-abisso">{count} turni</span>. Potrai annullarli uno per uno o tutti insieme.
                        </p>
                    )}
                </>
            )}
        </FormModal>
    );
};
