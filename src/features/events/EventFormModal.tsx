import React, { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Checkbox, ChoiceChips, Field, fieldClass } from '@/components/form/Field';
import { CityCombobox, DatePicker, TimePicker } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/hooks/useAuth';
import { databaseService, type EventInput } from '@/services/database';
import { EVENT_TYPES } from '@/data/events';
import { check, isoDate, integerBetween, maxLength, minLength, notAfter, notBefore, required, time } from '@/utils/validation';
import { addDaysISO, formatDate, isValidISODate, todayISO } from '@/utils/dates';
import type { EventType, SwimMeet } from '@/types/types';

type Values = {
    type: EventType;
    title: string;
    description: string;
    date: string;
    time: string;
    endTime: string;
    isOnline: boolean;
    onlineUrl: string;
    city: string;
    cityProvince: string;
    address: string;
    price: string;
    maxParticipants: string;
};

export const validateEvent = (v: Values, now: Date = new Date(), editing = false): FormErrors<Values> => {
    const today = todayISO(now);
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return {
        title: check(v.title, required('Dai un titolo all’evento.'), minLength(5), maxLength(100)),
        description: check(v.description, required('Spiega di cosa si tratta.'), minLength(20, 'Scrivi almeno 20 caratteri: cosa farete e per chi è.'), maxLength(2000)),
        date: check(v.date, required('Indica il giorno.'), isoDate, notBefore(today, 'La data è già passata.'), notAfter(addDaysISO(today, 365), 'Massimo un anno in anticipo.')),
        time: check(v.time, required('Indica l’ora di inizio.'), time) || (!editing && v.date === today && v.time && v.time <= nowTime ? 'Quest’ora è già passata.' : undefined),
        endTime: check(v.endTime, time) || (v.endTime && v.time && v.endTime <= v.time ? 'La fine deve essere dopo l’inizio.' : undefined),
        onlineUrl: v.isOnline ? check(v.onlineUrl, required('Incolla il link per collegarsi.'), maxLength(500)) || (!/^https:\/\/\S+$/.test(v.onlineUrl.trim()) ? 'Il link deve iniziare con https://' : undefined) : undefined,
        city: v.isOnline ? undefined : check(v.city, required('Indica il comune.'), minLength(2), maxLength(80)) || (!v.cityProvince ? 'Scegli il comune dall’elenco.' : undefined),
        address: check(v.address, maxLength(200)),
        price: check(v.price, integerBetween(0, 5000, 'Indica una quota tra 0 e 5000 €, o lascia vuoto se è gratuito.')),
        maxParticipants: check(v.maxParticipants, integerBetween(2, 500, 'Indica un numero tra 2 e 500, o lascia vuoto.')),
    };
};

const fromEvent = (e: SwimMeet | null | undefined, user: { city?: string; province?: string } | null): Values => ({
    type: e?.type || 'allenamento',
    title: e?.title || '',
    description: e?.description || '',
    date: e?.date || '',
    time: e?.time || '',
    endTime: e?.endTime || '',
    isOnline: !!e?.isOnline,
    onlineUrl: e?.onlineUrl || '',
    city: e ? (e.isOnline ? '' : e.city) : user?.city || '',
    cityProvince: e ? e.province || '' : user?.city ? (user?.province || '').toUpperCase() : '',
    address: e?.address || '',
    price: e?.price ? String(e.price) : '',
    maxParticipants: e?.maxParticipants ? String(e.maxParticipants) : '',
});

const PLACEHOLDER: Record<EventType, string> = {
    allenamento: 'Es. Allenamento master condiviso in vasca lunga',
    gara: 'Es. Trofeo master città di Monza',
    corso: 'Es. Corso BLSD per assistenti bagnanti',
    open_day: 'Es. Open day della scuola nuoto',
    webinar: 'Es. Didattica per i corsi 4–6 anni',
    incontro: 'Es. Aperitivo tra istruttori della zona',
    altro: 'Es. Pulizia della spiaggia con i bagnini',
};

/** Crea o modifica un evento (allenamento, gara, corso, open day, webinar…). */
export const EventFormModal: React.FC<{ open: boolean; event?: SwimMeet | null; groupId?: string; onClose: () => void; onSaved: (e: SwimMeet) => void }> = ({ open, event, groupId, onClose, onSaved }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const editing = !!event;
    const form = useForm<Values>(fromEvent(event, user), useCallback((v: Values) => validateEvent(v, new Date(), editing), [editing]));
    const { values, errors, bind, set } = form;

    useEffect(() => {
        if (open) form.reset(fromEvent(event, user));
    }, [open, event]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        const data: EventInput = {
            type: v.type,
            title: v.title.trim(),
            description: v.description.trim(),
            date: v.date,
            time: v.time,
            endTime: v.endTime,
            isOnline: v.isOnline,
            onlineUrl: v.isOnline ? v.onlineUrl.trim() : '',
            city: v.isOnline ? '' : v.city.trim(),
            province: v.isOnline ? '' : v.cityProvince,
            address: v.isOnline ? '' : v.address.trim(),
            price: v.price ? Number(v.price) : 0,
            maxParticipants: v.maxParticipants ? Number(v.maxParticipants) : null,
            ...(groupId && !editing ? { groupId } : {}),
        };
        try {
            const saved = event ? await databaseService.updateSwimMeet(event.$id, data) : await databaseService.createSwimMeet(data);
            showToast(event ? 'Evento aggiornato: gli iscritti sono stati avvisati dei cambi di data o luogo.' : 'Evento pubblicato.', 'success');
            onSaved(saved);
            onClose();
        } catch (error) {
            console.error('Evento:', error);
            showToast(error instanceof Error ? error.message : 'Non è stato possibile salvare l’evento.', 'error');
        } finally {
            setSaving(false);
        }
    });

    return (
        <FormModal
            open={open}
            title={editing ? 'Modifica l’evento' : 'Nuovo evento'}
            description={editing ? undefined : 'Allenamenti condivisi, gare, corsi, open day o webinar: chi è interessato si iscrive e lo aggiunge al calendario.'}
            icon="calendar"
            size="lg"
            dirty={form.isDirty}
            busy={saving}
            submitLabel={editing ? 'Salva modifiche' : 'Pubblica evento'}
            busyLabel="Salvataggio…"
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
        >
            <div>
                <p className="text-sm font-semibold text-abisso mb-1.5">Tipo di evento</p>
                <ChoiceChips label="Tipo di evento" options={EVENT_TYPES.map(({ value, label }) => ({ value, label }))} value={[values.type]} onChange={(t) => set('type', t[0])} />
            </div>
            <Field id="event-title" label="Titolo" error={errors.title}>
                <input {...bind('title')} placeholder={PLACEHOLDER[values.type]} maxLength={110} />
            </Field>
            <Field id="event-desc" label="Descrizione" error={errors.description} count={{ value: values.description, max: 2000 }}>
                <textarea {...bind('description')} rows={4} className={fieldClass(errors.description, 'resize-y')} placeholder="Programma, a chi è rivolto, cosa portare, eventuali brevetti richiesti." />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr] gap-4">
                <Field id="event-date" label="Giorno" error={errors.date} hint={isValidISODate(values.date) && !errors.date ? formatDate(values.date, 'weekday') : undefined}>
                    <DatePicker label="Giorno" {...form.field('date')} min={todayISO()} max={addDaysISO(todayISO(), 365)} />
                </Field>
                <Field id="event-time" label="Inizio" error={errors.time}>
                    <TimePicker label="Ora di inizio" {...form.field('time')} />
                </Field>
                <Field id="event-end" label="Fine" optional error={errors.endTime}>
                    <TimePicker label="Ora di fine" {...form.field('endTime')} after={values.time} />
                </Field>
            </div>

            <Checkbox id="event-online" checked={values.isOnline} onChange={(c) => set('isOnline', c)} label="Si svolge online" description="Webinar o videochiamata: il link compare nella pagina dell’evento." />
            {values.isOnline ? (
                <Field id="event-url" label="Link per collegarsi" error={errors.onlineUrl}>
                    <input {...bind('onlineUrl')} type="url" inputMode="url" placeholder="https://meet.google.com/…" maxLength={500} />
                </Field>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field id="event-city" label="Comune" error={errors.city}>
                        <CityCombobox
                            value={values.city}
                            onChange={(city, prov) => form.patch({ city, cityProvince: prov || (city === values.city ? values.cityProvince : '') })}
                            onBlur={() => form.touch('city')}
                            label="Comune"
                            placeholder="Cerca il comune"
                        />
                    </Field>
                    <Field id="event-address" label="Luogo" optional error={errors.address}>
                        <input {...bind('address')} placeholder="Es. Piscina Cozzi, viale Tunisia 35" autoComplete="street-address" maxLength={210} />
                    </Field>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <Field id="event-price" label="Quota in euro" optional error={errors.price} hint="Vuoto = gratuito.">
                    <input {...bind('price')} type="number" inputMode="numeric" min={0} max={5000} step={1} />
                </Field>
                <Field id="event-max" label="Posti" optional error={errors.maxParticipants} hint="Oltre il limite si entra in lista d’attesa.">
                    <input {...bind('maxParticipants')} type="number" inputMode="numeric" min={2} max={500} step={1} />
                </Field>
            </div>
        </FormModal>
    );
};
