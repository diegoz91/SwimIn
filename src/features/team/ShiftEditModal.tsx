import React, { useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Field } from '@/components/form/Field';
import { DatePicker, Select, TimePicker } from '@/components/form/Pickers';
import { databaseService, type TeamMember } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { addDaysISO, isValidISODate, todayISO } from '@/utils/dates';
import type { SquadShift } from '@/types/types';

const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Un amministratore sposta o riassegna un turno: la persona deve riconfermarlo. */
export const ShiftEditModal: React.FC<{ shift: SquadShift | null; staff: TeamMember[]; onClose: () => void; onSaved: (s: SquadShift) => void }> = ({ shift, staff, onClose, onSaved }) => {
    const { showToast } = useToast();
    const [v, setV] = useState({ userId: '', date: '', start: '', end: '' });
    const [errors, setErrors] = useState<Partial<Record<keyof typeof v, string>>>({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!shift) return;
        const [start = '', end = ''] = shift.shiftTime.split('–');
        setV({ userId: shift.userId, date: shift.date, start, end });
        setErrors({});
    }, [shift]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!shift) return;
        const err: typeof errors = {};
        if (!v.userId) err.userId = 'Scegli chi coprirà il turno.';
        if (!isValidISODate(v.date)) err.date = 'Data non valida: usa il formato gg/mm/aaaa.';
        else if (v.date < todayISO()) err.date = 'La data è già passata.';
        if (!validTime(v.start)) err.start = 'Orario non valido.';
        if (!validTime(v.end)) err.end = 'Orario non valido.';
        else if (v.end <= v.start) err.end = 'La fine deve essere dopo l’inizio.';
        setErrors(err);
        if (Object.keys(err).length) return;
        setBusy(true);
        try {
            const saved = await databaseService.updateSquadShift(shift.$id, { userId: v.userId, date: v.date, shiftTime: `${v.start}–${v.end}` });
            showToast(saved.userId !== shift.userId ? 'Turno riassegnato: abbiamo avvisato entrambi.' : 'Turno spostato: la persona deve riconfermarlo.', 'success');
            onSaved(saved);
            onClose();
        } catch (er) {
            showToast(er instanceof Error ? er.message : 'Modifica non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const dirty = !!shift && (v.userId !== shift.userId || v.date !== shift.date || `${v.start}–${v.end}` !== shift.shiftTime);

    return (
        <FormModal open={!!shift} title="Modifica il turno" icon="calendar" submitLabel="Salva" busy={busy} dirty={dirty} onClose={onClose} onSubmit={submit}>
            <Field id="shift-edit-user" label="Chi lo copre" error={errors.userId}>
                <Select
                    label="Chi lo copre"
                    value={v.userId}
                    onChange={(id) => setV({ ...v, userId: id })}
                    options={staff.map((s) => ({ value: s.userId, label: `${s.firstName} ${s.lastName}`.trim() || 'Membro dello staff', hint: s.title }))}
                />
            </Field>
            <Field id="shift-edit-date" label="Data" error={errors.date}>
                <DatePicker label="Data del turno" min={todayISO()} max={addDaysISO(todayISO(), 180)} value={v.date} onChange={(d) => setV({ ...v, date: d })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
                <Field id="shift-edit-start" label="Inizio" error={errors.start}>
                    <TimePicker label="Inizio del turno" value={v.start} onChange={(t) => setV({ ...v, start: t })} />
                </Field>
                <Field id="shift-edit-end" label="Fine" error={errors.end}>
                    <TimePicker label="Fine del turno" after={v.start} value={v.end} onChange={(t) => setV({ ...v, end: t })} />
                </Field>
            </div>
        </FormModal>
    );
};
