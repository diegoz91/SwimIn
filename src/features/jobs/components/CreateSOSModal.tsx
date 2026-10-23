import React, { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { ProvinceSelect, Suggestions } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { CERT_NAMES } from '@/data/swimming';
import { check, integerBetween, maxLength, minLength, notAfter, notBefore, province, required, time } from '@/utils/validation';
import { addDaysISO, formatDate, todayISO } from '@/utils/dates';

const SOS_ROLES = ['Assistente bagnanti', 'Istruttore di nuoto', 'Allenatore', 'Istruttore di acquafitness', 'Istruttore di acquaticità neonatale', 'Responsabile impianto'];
const MAX_DAYS_AHEAD = 60;

type Values = {
    role: string;
    date: string;
    start: string;
    end: string;
    pay: string;
    city: string;
    province: string;
    qualification: string;
    notes: string;
};

export const validateSOS = (v: Values, today: string = todayISO()): FormErrors<Values> => ({
    role: check(v.role, required('Scegli il ruolo da sostituire.')),
    date: check(
        v.date,
        required('Indica il giorno.'),
        notBefore(today, 'La data è già passata.'),
        notAfter(addDaysISO(today, MAX_DAYS_AHEAD), `Le sostituzioni urgenti si pubblicano al massimo ${MAX_DAYS_AHEAD} giorni prima.`)
    ),
    start: check(v.start, required('Indica l’inizio.'), time),
    end: check(v.end, required('Indica la fine.'), time) || (v.start && v.end <= v.start ? 'La fine deve essere dopo l’inizio.' : undefined),
    pay: check(v.pay, required('Indica il compenso.'), integerBetween(10, 2000, 'Indica un compenso tra 10 e 2000 €.')),
    city: check(v.city, required('Indica la città.'), minLength(2), maxLength(80)),
    province: check(v.province, province),
    qualification: check(v.qualification, required('Indica il brevetto richiesto.'), maxLength(120)),
    notes: check(v.notes, maxLength(500)),
});

/** Richiesta di sostituzione urgente: data e orari precisi, compenso, brevetto richiesto. */
export const CreateSOSModal: React.FC<{ isOpen: boolean; onClose: () => void; onCreated: () => void; structureId: string }> = ({ isOpen, onClose, onCreated, structureId }) => {
    const { showToast } = useToast();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const initial = (): Values => ({
        role: 'Assistente bagnanti',
        date: todayISO(),
        start: '',
        end: '',
        pay: '',
        city: user?.city || '',
        province: (user?.province || '').toUpperCase(),
        qualification: 'Brevetto Assistente Bagnanti',
        notes: '',
    });
    const form = useForm<Values>(initial(), useCallback((v: Values) => validateSOS(v), []));
    const { values, errors, bind, set } = form;

    useEffect(() => {
        if (isOpen) form.reset(initial());
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        const shift = `${v.start}–${v.end}`;
        const when = v.date === todayISO() ? 'oggi' : v.date === addDaysISO(todayISO(), 1) ? 'domani' : formatDate(v.date, 'weekday');
        try {
            await databaseService.createJob({
                structureId,
                title: `Sostituzione urgente: ${v.role}`,
                description: [
                    `Cerchiamo un ${v.role.toLowerCase()} per ${when}, dalle ${v.start} alle ${v.end}.`,
                    `Compenso: ${v.pay} € netti per il turno.`,
                    v.notes.trim(),
                    'Candidati solo se sei disponibile per questo turno.',
                ].filter(Boolean).join('\n'),
                role: v.role.toLowerCase(),
                contractType: 'collaborazione',
                city: v.city.trim(),
                province: v.province,
                salaryMin: Number(v.pay),
                salaryMax: Number(v.pay),
                isSOS: true,
                sosDate: v.date,
                sosShift: shift,
                requirements: ['Disponibilità per il turno indicato'],
                qualificationsRequired: [v.qualification.trim()],
            });
            showToast('Richiesta pubblicata: i professionisti disponibili in zona la vedono in cima alla bacheca.', 'success');
            onCreated();
            onClose();
        } catch (error) {
            console.error('SOS:', error);
            showToast(error instanceof Error && error.message ? error.message : 'Non è stato possibile pubblicare la richiesta.', 'error');
        } finally {
            setSaving(false);
        }
    });

    return (
        <FormModal
            open={isOpen}
            tone="danger"
            title="Sostituzione urgente"
            description="Per assenze improvvise: la richiesta compare in evidenza e scade dopo il turno."
            icon="alert-triangle"
            dirty={form.isDirty}
            busy={saving}
            submitLabel="Pubblica richiesta"
            busyLabel="Pubblicazione…"
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
        >
            <Field id="sos-role" label="Ruolo da sostituire" error={errors.role}>
                <select {...bind('role')}>
                    {SOS_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                    ))}
                </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr] gap-4">
                <Field id="sos-date" label="Giorno" error={errors.date} hint={values.date && !errors.date ? formatDate(values.date, 'weekday') : undefined}>
                    <input type="date" {...bind('date')} min={todayISO()} max={addDaysISO(todayISO(), MAX_DAYS_AHEAD)} />
                </Field>
                <Field id="sos-start" label="Dalle" error={errors.start}>
                    <input type="time" {...bind('start')} step={900} />
                </Field>
                <Field id="sos-end" label="Alle" error={errors.end}>
                    <input type="time" {...bind('end')} step={900} min={values.start || undefined} />
                </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-4">
                <Field id="sos-pay" label="Compenso netto in euro" error={errors.pay} hint="Per l’intero turno.">
                    <input {...bind('pay')} type="number" inputMode="numeric" min={10} max={2000} step={1} placeholder="Es. 80" />
                </Field>
                <Field id="sos-qual" label="Brevetto richiesto" error={errors.qualification}>
                    <input {...bind('qualification')} list="sos-qual-options" maxLength={130} />
                </Field>
            </div>
            <Suggestions id="sos-qual-options" options={CERT_NAMES} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="sos-city" label="Città" error={errors.city}>
                    <input {...bind('city')} autoComplete="address-level2" maxLength={90} />
                </Field>
                <Field id="sos-prov" label="Provincia" optional error={errors.province}>
                    <ProvinceSelect value={values.province} onChange={(c) => set('province', c)} />
                </Field>
            </div>

            <Field id="sos-notes" label="Note per chi si candida" optional error={errors.notes} count={{ value: values.notes, max: 500 }}>
                <textarea {...bind('notes')} rows={3} className={fieldClass(errors.notes, 'resize-y')} placeholder="Es. Vasca da 25 m, turno di nuoto libero con 2 assistenti." />
            </Field>
        </FormModal>
    );
};
