import React, { useCallback, useEffect, useState } from 'react';
import { FormModal, FormSection } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { ProvinceSelect } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { check, integerBetween, maxLength, minLength, noContactInfo, province, required } from '@/utils/validation';
import { addDaysISO, formatDate, todayISO } from '@/utils/dates';

interface CreateJobModalProps {
    isOpen: boolean;
    onClose: () => void;
    onJobCreated: () => void;
    structureId: string;
}

const ROLES = [
    { value: 'istruttore', label: 'Istruttore di nuoto' },
    { value: 'bagnino', label: 'Assistente bagnanti' },
    { value: 'allenatore', label: 'Allenatore' },
    { value: 'acquafitness', label: 'Istruttore di acquafitness' },
    { value: 'coordinatore', label: 'Coordinatore' },
    { value: 'tecnico', label: 'Tecnico manutentore' },
    { value: 'receptionist', label: 'Receptionist' },
    { value: 'altro', label: 'Altro' },
];

const CONTRACTS = [
    { value: 'full-time', label: 'Tempo pieno' },
    { value: 'part-time', label: 'Part-time' },
    { value: 'stagionale', label: 'Stagionale' },
    { value: 'collaborazione', label: 'Collaborazione sportiva' },
    { value: 'tirocinio', label: 'Tirocinio' },
];

const EXPIRY_OPTIONS = [7, 14, 30, 60, 90];
const DESCRIPTION_MAX = 4000;

type Values = {
    title: string;
    role: string;
    contractType: string;
    city: string;
    province: string;
    description: string;
    salaryMin: string;
    salaryMax: string;
    workingHours: string;
    requirements: string;
    qualifications: string;
    expiryDays: string;
};

const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

const listRule = (label: string) => (v: string) => {
    const items = lines(v);
    if (items.length > 20) return `Massimo 20 ${label}, uno per riga.`;
    if (items.some((l) => l.length > 200)) return 'Ogni riga può avere al massimo 200 caratteri.';
    return undefined;
};

export const validateJob = (v: Values): FormErrors<Values> => {
    const min = v.salaryMin ? Number(v.salaryMin) : undefined;
    const max = v.salaryMax ? Number(v.salaryMax) : undefined;
    return {
        title: check(v.title, required('Dai un titolo all’annuncio.'), minLength(8, 'Un titolo chiaro ha almeno 8 caratteri (es. "Istruttore corsi bambini").'), maxLength(120)),
        city: check(v.city, required('Indica la città.'), minLength(2), maxLength(80)),
        province: check(v.province, required('Scegli la provincia.'), province),
        description: check(v.description, required('Descrivi il lavoro.'), minLength(50, 'Scrivi almeno 50 caratteri: mansioni, orari, cosa offrite.'), maxLength(DESCRIPTION_MAX), noContactInfo),
        salaryMin: check(v.salaryMin, integerBetween(100, 10000, 'Indica un importo mensile tra 100 e 10.000 €.')),
        salaryMax:
            check(v.salaryMax, integerBetween(100, 10000, 'Indica un importo mensile tra 100 e 10.000 €.')) ||
            (min !== undefined && max !== undefined && min > max ? 'Il massimo non può essere inferiore al minimo.' : undefined),
        workingHours: check(v.workingHours, maxLength(120)),
        requirements: listRule('requisiti')(v.requirements),
        qualifications: listRule('brevetti')(v.qualifications),
    };
};

const initial = (city = '', prov = ''): Values => ({
    title: '',
    role: 'istruttore',
    contractType: 'part-time',
    city,
    province: prov.toUpperCase(),
    description: '',
    salaryMin: '',
    salaryMax: '',
    workingHours: '',
    requirements: '',
    qualifications: '',
    expiryDays: '30',
});

export const CreateJobModal: React.FC<CreateJobModalProps> = ({ isOpen, onClose, onJobCreated, structureId }) => {
    const { showToast } = useToast();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const form = useForm<Values>(initial(), useCallback(validateJob, []));
    const { values, errors, bind, set } = form;

    useEffect(() => {
        if (isOpen) form.reset(initial(user?.city, user?.province));
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        try {
            await databaseService.createJob({
                structureId,
                title: v.title.trim(),
                description: v.description.trim(),
                role: v.role,
                contractType: v.contractType,
                city: v.city.trim(),
                province: v.province,
                salaryMin: v.salaryMin ? Number(v.salaryMin) : undefined,
                salaryMax: v.salaryMax ? Number(v.salaryMax) : undefined,
                workingHours: v.workingHours.trim(),
                requirements: lines(v.requirements),
                qualificationsRequired: lines(v.qualifications),
                ...({ expiryDays: Number(v.expiryDays) } as Record<string, unknown>),
            });
            showToast('Annuncio pubblicato.', 'success');
            onJobCreated();
            onClose();
        } catch (error) {
            console.error('Pubblicazione annuncio:', error);
            showToast(error instanceof Error && error.message ? error.message : 'Pubblicazione non riuscita. Riprova tra qualche istante.', 'error');
        } finally {
            setSaving(false);
        }
    });

    return (
        <FormModal
            open={isOpen}
            size="lg"
            title="Pubblica un annuncio"
            icon="briefcase"
            dirty={form.isDirty}
            busy={saving}
            submitLabel="Pubblica"
            busyLabel="Pubblicazione…"
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
        >
            <FormSection title="La posizione">
                <Field id="job-title" label="Titolo" error={errors.title}>
                    <input {...bind('title')} placeholder="Es. Istruttore di nuoto per corsi bambini" maxLength={130} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field id="job-role" label="Ruolo">
                        <select {...bind('role')}>
                            {ROLES.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field id="job-contract" label="Contratto">
                        <select {...bind('contractType')}>
                            {CONTRACTS.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                    </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field id="job-city" label="Città" error={errors.city}>
                        <input {...bind('city')} placeholder="Es. Milano" autoComplete="address-level2" maxLength={90} />
                    </Field>
                    <Field id="job-prov" label="Provincia" error={errors.province}>
                        <ProvinceSelect value={values.province} onChange={(c) => set('province', c)} onBlur={() => form.touch('province')} />
                    </Field>
                </div>
                <Field
                    id="job-desc"
                    label="Descrizione"
                    error={errors.description}
                    count={{ value: values.description, max: DESCRIPTION_MAX }}
                    hint="Mansioni, fasce d’età degli allievi, orari, ambiente di lavoro. I candidati ti scrivono dalla piattaforma: non serve inserire email o link."
                >
                    <textarea {...bind('description')} rows={6} className={fieldClass(errors.description, 'resize-y min-h-[8rem]')} />
                </Field>
            </FormSection>

            <FormSection title="Compenso e orario" description="Gli annunci con il compenso indicato ricevono più candidature.">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field id="job-min" label="Da (€/mese)" optional error={errors.salaryMin}>
                        <input {...bind('salaryMin')} type="number" inputMode="numeric" min={100} max={10000} step={50} placeholder="1200" />
                    </Field>
                    <Field id="job-max" label="A (€/mese)" optional error={errors.salaryMax}>
                        <input {...bind('salaryMax')} type="number" inputMode="numeric" min={values.salaryMin || 100} max={10000} step={50} placeholder="1600" />
                    </Field>
                    <Field id="job-hours" label="Orario" optional error={errors.workingHours} className="col-span-2 sm:col-span-1">
                        <input {...bind('workingHours')} placeholder="Es. 20 h/settimana, pomeriggi" maxLength={130} />
                    </Field>
                </div>
            </FormSection>

            <FormSection title="Requisiti">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field id="job-req" label="Requisiti" optional error={errors.requirements} hint="Uno per riga.">
                        <textarea {...bind('requirements')} rows={4} className={fieldClass(errors.requirements, 'resize-y')} placeholder={'Esperienza con bambini\nDisponibilità il sabato'} />
                    </Field>
                    <Field id="job-qual" label="Brevetti richiesti" optional error={errors.qualifications} hint="Uno per riga: servono a calcolare l’affinità con i profili.">
                        <textarea {...bind('qualifications')} rows={4} className={fieldClass(errors.qualifications, 'resize-y')} placeholder={'Istruttore di nuoto 1° livello\nBLSD esecutore'} />
                    </Field>
                </div>
            </FormSection>

            <Field id="job-expiry" label="Resta visibile per" hint={`Fino al ${formatDate(addDaysISO(todayISO(), Number(values.expiryDays)))}, poi sparisce dalla bacheca.`}>
                <select {...bind('expiryDays')} className={fieldClass(undefined, 'sm:w-1/2')}>
                    {EXPIRY_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d} giorni</option>
                    ))}
                </select>
            </Field>
        </FormModal>
    );
};
