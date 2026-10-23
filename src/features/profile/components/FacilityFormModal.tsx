import React, { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { SuggestInput } from '@/components/form/Pickers';
import { LocationFields } from '@/components/form/LocationFields';
import { useComuniSync } from '@/data/comuni';
import { provinceName } from '@/data/italy';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { STRUCTURE_TYPES } from '@/data/swimming';
import { check, comuneOf, maxLength, minLength, province, required } from '@/utils/validation';

export interface FacilityFormValues {
    name: string;
    type: string;
    city: string;
    province: string;
    bio: string;
    [key: string]: unknown;
}

const BIO_MAX = 2500;

const validate = (v: FacilityFormValues, comuni: string[] = []): FormErrors<FacilityFormValues> => ({
    name: check(v.name, required('Indica il nome della struttura.'), minLength(2), maxLength(120)),
    type: check(v.type, maxLength(80)),
    city: check(v.city, required('Indica il comune.'), minLength(2), maxLength(80), comuneOf(comuni, provinceName(v.province))),
    province: check(v.province, required('Scegli la provincia.'), province),
    bio: check(v.bio, maxLength(BIO_MAX)),
});

interface Props {
    open: boolean;
    mode: 'create' | 'edit';
    initial?: Partial<FacilityFormValues>;
    onClose: () => void;
    /** Salva i dati già ripuliti; se lancia un errore la modale resta aperta. */
    onSubmit: (values: FacilityFormValues) => Promise<void>;
}

/** Creazione e modifica di una pagina struttura gestita da un professionista. */
export const FacilityFormModal: React.FC<Props> = ({ open, mode, initial, onClose, onSubmit }) => {
    const [saving, setSaving] = useState(false);
    const toValues = (): FacilityFormValues => ({
        name: initial?.name || '',
        type: initial?.type || '',
        city: initial?.city || '',
        province: (initial?.province || '').toUpperCase(),
        bio: initial?.bio || '',
    });
    const [comuni, setComuni] = useState<string[]>([]);
    const form = useForm<FacilityFormValues>(toValues(), useCallback((v: FacilityFormValues) => validate(v, comuni), [comuni]));
    const { values, errors, bind, set } = form;
    useComuniSync(values.province, setComuni);

    useEffect(() => {
        if (open) form.reset(toValues());
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        try {
            const trim = (s: string) => s.trim().replace(/\s+/g, ' ');
            await onSubmit({ name: trim(v.name), type: trim(v.type), city: trim(v.city), province: v.province.toUpperCase(), bio: v.bio.trim() });
            onClose();
        } catch (error) {
            console.error('Pagina struttura:', error);
        } finally {
            setSaving(false);
        }
    });

    return (
        <FormModal
            open={open}
            title={mode === 'create' ? 'Crea la pagina della struttura' : 'Modifica la pagina'}
            description={mode === 'create' ? 'Potrai pubblicare offerte di lavoro e gestire lo staff. Ne sarai l’amministratore.' : undefined}
            icon="building"
            dirty={form.isDirty}
            busy={saving}
            submitLabel={mode === 'create' ? 'Crea pagina' : 'Salva'}
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
        >
            <Field id="fac-name" label="Nome della struttura" error={errors.name}>
                <input {...bind('name')} placeholder="Es. Piscina comunale Segrate" autoComplete="organization" maxLength={130} />
            </Field>
            <Field id="fac-type" label="Tipo" optional error={errors.type}>
                <SuggestInput value={values.type} onChange={(v) => set('type', v)} onBlur={() => form.touch('type')} options={STRUCTURE_TYPES} label="Tipi di struttura" placeholder="Es. Centro sportivo" maxLength={90} />
            </Field>
            <LocationFields
                idPrefix="fac"
                province={values.province}
                city={values.city}
                onProvince={(c) => set('province', c)}
                onCity={(c) => set('city', c)}
                onTouch={(k) => form.touch(k)}
                errors={{ province: errors.province, city: errors.city }}
            />
            {mode === 'edit' && (
                <Field id="fac-bio" label="Presentazione" optional error={errors.bio} count={{ value: values.bio, max: BIO_MAX }} hint="Vasche, servizi, orari, ambiente di lavoro.">
                    <textarea {...bind('bio')} rows={5} className={fieldClass(errors.bio, 'resize-y min-h-[7rem]')} />
                </Field>
            )}
        </FormModal>
    );
};
