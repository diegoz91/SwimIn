import React, { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { CityCombobox, DatePicker, TimePicker } from '@/components/form/Pickers';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { check, isoDate, integerBetween, maxLength, minLength, notAfter, notBefore, required, time } from '@/utils/validation';
import { addDaysISO, formatDate, isValidISODate, todayISO } from '@/utils/dates';

type Values = { title: string; description: string; date: string; time: string; city: string; cityProvince: string; address: string; maxParticipants: string };

export const validateMeet = (v: Values, now: Date = new Date()): FormErrors<Values> => {
    const today = todayISO(now);
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return {
        title: check(v.title, required('Dai un titolo all’incontro.'), minLength(5), maxLength(100)),
        description: check(v.description, required('Spiega di cosa si tratta.'), minLength(20, 'Scrivi almeno 20 caratteri: cosa farete e per chi è.'), maxLength(1000)),
        date: check(v.date, required('Indica il giorno.'), isoDate, notBefore(today, 'La data è già passata.'), notAfter(addDaysISO(today, 365), 'Massimo un anno in anticipo.')),
        time: check(v.time, required('Indica l’ora.'), time) || (v.date === today && v.time && v.time <= nowTime ? 'Quest’ora è già passata.' : undefined),
        city: check(v.city, required('Indica il comune.'), minLength(2), maxLength(80)) || (!v.cityProvince ? 'Scegli il comune dall’elenco.' : undefined),
        address: check(v.address, maxLength(200)),
        maxParticipants: check(v.maxParticipants, integerBetween(2, 500, 'Indica un numero tra 2 e 500, o lascia vuoto.')),
    };
};

/** Incontro dal vivo (allenamento condiviso, aggiornamento, ritrovo) aperto alla rete. */
export const CreateMeetModal: React.FC<{ open: boolean; onClose: () => void; onCreated: () => void }> = ({ open, onClose, onCreated }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const initial = (): Values => ({ title: '', description: '', date: '', time: '', city: user?.city || '', cityProvince: user?.city ? (user?.province || '').toUpperCase() : '', address: '', maxParticipants: '' });
    const form = useForm<Values>(initial(), useCallback((v: Values) => validateMeet(v), []));
    const { values, errors, bind } = form;

    useEffect(() => {
        if (open) form.reset(initial());
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        if (!user) return;
        setSaving(true);
        try {
            await databaseService.createSwimMeet({
                title: v.title.trim(),
                description: v.description.trim(),
                date: v.date,
                time: v.time,
                city: v.city.trim(),
                address: v.address.trim(),
                creatorId: user.$id,
                maxParticipants: v.maxParticipants ? Number(v.maxParticipants) : undefined,
            });
            showToast('Incontro pubblicato.', 'success');
            onCreated();
            onClose();
        } catch (error) {
            console.error('Swim-Meet:', error);
            showToast('Non è stato possibile pubblicare l’incontro.', 'error');
        } finally {
            setSaving(false);
        }
    });

    return (
        <FormModal
            open={open}
            title="Nuovo Swim-Meet"
            description="Un incontro dal vivo con altri professionisti: allenamento condiviso, aggiornamento, ritrovo."
            icon="location"
            dirty={form.isDirty}
            busy={saving}
            submitLabel="Pubblica"
            busyLabel="Pubblicazione…"
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
        >
            <Field id="meet-title" label="Titolo" error={errors.title}>
                <input {...bind('title')} placeholder="Es. Allenamento master condiviso" maxLength={110} />
            </Field>
            <Field id="meet-desc" label="Descrizione" error={errors.description} count={{ value: values.description, max: 1000 }}>
                <textarea {...bind('description')} rows={3} className={fieldClass(errors.description, 'resize-y')} placeholder="Cosa farete, per chi è, cosa portare." />
            </Field>
            <div className="grid grid-cols-2 gap-4">
                <Field id="meet-date" label="Giorno" error={errors.date} hint={isValidISODate(values.date) && !errors.date ? formatDate(values.date, 'weekday') : undefined}>
                    <DatePicker label="Giorno" {...form.field('date')} min={todayISO()} max={addDaysISO(todayISO(), 365)} />
                </Field>
                <Field id="meet-time" label="Ora" error={errors.time}>
                    <TimePicker label="Ora" {...form.field('time')} />
                </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="meet-city" label="Comune" error={errors.city}>
                    <CityCombobox
                        value={values.city}
                        onChange={(city, prov) => form.patch({ city, cityProvince: prov || (city === values.city ? values.cityProvince : '') })}
                        onBlur={() => form.touch('city')}
                        label="Comune"
                        placeholder="Cerca il comune"
                    />
                </Field>
                <Field id="meet-max" label="Posti" optional error={errors.maxParticipants} hint="Vuoto = nessun limite.">
                    <input {...bind('maxParticipants')} type="number" inputMode="numeric" min={2} max={500} step={1} />
                </Field>
            </div>
            <Field id="meet-address" label="Luogo" optional error={errors.address}>
                <input {...bind('address')} placeholder="Es. Piscina Cozzi, viale Tunisia 35" autoComplete="street-address" maxLength={210} />
            </Field>
        </FormModal>
    );
};
