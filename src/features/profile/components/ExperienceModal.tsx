import React, { useCallback, useEffect, useState } from 'react';
import type { Experience } from '@/types/types';
import { FormModal } from '@/components/form/FormModal';
import { Checkbox, Field, fieldClass } from '@/components/form/Field';
import { MonthYearPicker, Suggestions } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useToast } from '@/context/ToastContext';
import { EMPLOYMENT_TYPES, PROFESSIONAL_ROLES } from '@/data/swimming';
import { check, maxLength, minLength, month, notAfter, notBefore, required } from '@/utils/validation';
import { currentMonth, formatDuration, monthsBetween } from '@/utils/dates';

interface ExperienceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (experience: Experience) => Promise<void>;
    onDelete?: () => Promise<void>;
    experience?: Experience;
    mode: 'add' | 'edit';
}

type Values = {
    role: string;
    facility: string;
    employmentType: string;
    city: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
};

const EMPTY: Values = { role: '', facility: '', employmentType: '', city: '', startDate: '', endDate: '', current: false, description: '' };
const DESCRIPTION_MAX = 1000;

const toValues = (e?: Experience): Values =>
    e
        ? {
              role: e.role || '',
              facility: e.facility || '',
              employmentType: e.employmentType || '',
              city: e.city || '',
              startDate: e.startDate || '',
              endDate: e.endDate || '',
              current: !!e.current,
              description: e.description || '',
          }
        : EMPTY;

export const validateExperience = (v: Values, now: Date = new Date()): FormErrors<Values> => {
    const thisMonth = currentMonth(now);
    return {
        role: check(v.role, required('Indica il ruolo.'), minLength(2), maxLength(100)),
        facility: check(v.facility, required('Indica la struttura o la società.'), minLength(2), maxLength(120)),
        city: check(v.city, maxLength(80)),
        startDate: check(v.startDate, required('Indica mese e anno di inizio.'), month, notAfter(thisMonth, 'La data di inizio non può essere nel futuro.')),
        endDate: v.current
            ? undefined
            : check(
                  v.endDate,
                  required('Indica quando è terminata, oppure spunta "Ci lavoro ancora".'),
                  month,
                  notAfter(thisMonth, 'La data di fine non può essere nel futuro.'),
                  notBefore(v.startDate, 'La fine non può precedere l’inizio.')
              ),
        description: check(v.description, maxLength(DESCRIPTION_MAX)),
    };
};

export const ExperienceModal: React.FC<ExperienceModalProps> = ({ isOpen, onClose, onSave, onDelete, experience, mode }) => {
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const validate = useCallback((v: Values) => validateExperience(v), []);
    const form = useForm<Values>(EMPTY, validate);
    const { values, errors, bind, set, reset } = form;
    const legacyPeriod = mode === 'edit' && experience && !experience.startDate ? experience.period : undefined;

    useEffect(() => {
        if (isOpen) reset(toValues(mode === 'edit' ? experience : undefined));
    }, [isOpen, experience, mode, reset]);

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        try {
            const clean: Experience = {
                role: v.role.trim(),
                facility: v.facility.trim(),
                ...(v.employmentType ? { employmentType: v.employmentType } : {}),
                ...(v.city.trim() ? { city: v.city.trim() } : {}),
                startDate: v.startDate,
                ...(v.current ? { current: true } : { endDate: v.endDate }),
                ...(v.description.trim() ? { description: v.description.trim() } : {}),
            };
            await onSave(clean);
            showToast(mode === 'add' ? 'Esperienza aggiunta.' : 'Esperienza aggiornata.', 'success');
            onClose();
        } catch (error) {
            console.error('Salvataggio esperienza:', error);
            showToast('Non è stato possibile salvare l’esperienza. Riprova.', 'error');
        } finally {
            setSaving(false);
        }
    });

    const remove = async () => {
        if (!onDelete || !window.confirm('Eliminare questa esperienza dal profilo?')) return;
        setSaving(true);
        try {
            await onDelete();
            showToast('Esperienza eliminata.', 'info');
            onClose();
        } catch (error) {
            console.error('Eliminazione esperienza:', error);
            showToast('Eliminazione non riuscita.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const end = values.current ? currentMonth() : values.endDate;
    const duration = values.startDate && end && end >= values.startDate ? formatDuration(monthsBetween(values.startDate, end)) : '';

    return (
        <FormModal
            open={isOpen}
            title={mode === 'add' ? 'Aggiungi esperienza' : 'Modifica esperienza'}
            icon="briefcase"
            dirty={form.isDirty}
            busy={saving}
            submitLabel={mode === 'add' ? 'Aggiungi' : 'Salva'}
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
            secondaryAction={
                mode === 'edit' && onDelete ? (
                    <button type="button" onClick={remove} className="text-sm font-semibold text-galleggiante hover:underline">
                        Elimina
                    </button>
                ) : null
            }
        >
            {legacyPeriod && (
                <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3">
                    Periodo inserito in precedenza: <strong>{legacyPeriod}</strong>. Indica le date esatte qui sotto: così il profilo calcola la tua esperienza totale.
                </p>
            )}

            <Field id="exp-role" label="Ruolo" error={errors.role}>
                <input {...bind('role')} list="exp-role-options" placeholder="Es. Istruttore di nuoto" autoComplete="organization-title" maxLength={120} />
            </Field>
            <Suggestions id="exp-role-options" options={PROFESSIONAL_ROLES} />

            <Field id="exp-facility" label="Struttura o società" error={errors.facility}>
                <input {...bind('facility')} placeholder="Es. Piscina comunale Cozzi" autoComplete="organization" maxLength={140} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="exp-type" label="Tipo di rapporto" optional>
                    <select {...bind('employmentType')}>
                        <option value="">Non specificato</option>
                        {EMPLOYMENT_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field id="exp-city" label="Città" optional error={errors.city}>
                    <input {...bind('city')} placeholder="Es. Milano" autoComplete="address-level2" maxLength={90} />
                </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="exp-start" label="Inizio" error={errors.startDate}>
                    <MonthYearPicker label="Inizio" value={values.startDate} onChange={(v) => set('startDate', v)} onBlur={() => form.touch('startDate')} />
                </Field>
                <Field id="exp-end" label="Fine" error={errors.endDate} hint={values.current ? 'In corso' : undefined}>
                    <MonthYearPicker
                        label="Fine"
                        value={values.current ? '' : values.endDate}
                        onChange={(v) => set('endDate', v)}
                        onBlur={() => form.touch('endDate')}
                        minYear={values.startDate ? Number(values.startDate.slice(0, 4)) : 1960}
                        disabled={values.current}
                    />
                </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 -mt-1">
                <Checkbox
                    id="exp-current"
                    checked={values.current}
                    onChange={(c) => form.patch({ current: c, endDate: c ? '' : values.endDate })}
                    label="Ci lavoro ancora"
                />
                {duration && <span className="text-sm text-corsia-700 font-semibold animate-in fade-in duration-200">{duration}</span>}
            </div>

            <Field
                id="exp-desc"
                label="Di cosa ti occupavi"
                optional
                error={errors.description}
                count={{ value: values.description, max: DESCRIPTION_MAX }}
                hint="Corsi seguiti, età degli allievi, risultati, responsabilità."
            >
                <textarea {...bind('description')} rows={4} className={fieldClass(errors.description, 'resize-y min-h-[6rem]')} placeholder="Es. Corsi di avviamento per bambini 4–8 anni, gruppo pre-agonistico, gestione turni del sabato." />
            </Field>
        </FormModal>
    );
};
