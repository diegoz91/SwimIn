import React, { useCallback, useEffect, useState } from 'react';
import type { StructureProfile, UserProfile } from '@/types/types';
import { FormModal, FormSection } from '@/components/form/FormModal';
import { ChoiceChips, Field, fieldClass } from '@/components/form/Field';
import { ProvinceSelect, Suggestions } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { LANGUAGES } from '@/data/italy';
import { POOL_SERVICES, POOL_SETTINGS, PROFESSIONAL_ROLES, STRUCTURE_TYPES } from '@/data/swimming';
import {
    check, integerBetween, maxLength, minLength, normalizePhone, normalizeUrl, personName, phone, postalCode, province, required, url, vatNumber,
} from '@/utils/validation';

const BIO_MAX = 2500;

type Values = {
    firstName: string;
    lastName: string;
    title: string;
    structureName: string;
    structureType: string;
    city: string;
    province: string;
    address: string;
    postalCode: string;
    vatNumber: string;
    phone: string;
    website: string;
    bio: string;
    languages: string[];
    poolLength: string;
    lanes: string;
    poolSetting: string;
    services: string[];
};

const toValues = (p: UserProfile | StructureProfile): Values => {
    const s = p as Partial<StructureProfile>;
    const u = p as Partial<UserProfile>;
    return {
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        title: u.title || '',
        structureName: s.structureName || '',
        structureType: s.structureType || '',
        city: p.city || '',
        province: (p.province || '').toUpperCase(),
        address: s.address || '',
        postalCode: s.postalCode || '',
        vatNumber: s.vatNumber || '',
        phone: p.phone || '',
        website: p.website || '',
        bio: p.bio || '',
        languages: u.languages || [],
        poolLength: s.poolLength ? String(s.poolLength) : '',
        lanes: s.lanes ? String(s.lanes) : '',
        poolSetting: s.poolSetting || '',
        services: s.services || [],
    };
};

export const validateProfile = (v: Values, isProfessional: boolean): FormErrors<Values> => {
    const common: FormErrors<Values> = {
        city: check(v.city, required('Indica la città: serve per le offerte vicine.'), minLength(2), maxLength(80)),
        province: check(v.province, required('Scegli la provincia.'), province),
        phone: check(v.phone, phone),
        website: check(v.website, url, maxLength(500)),
        bio: check(v.bio, maxLength(BIO_MAX)),
    };
    if (isProfessional) {
        return {
            ...common,
            firstName: check(v.firstName, required('Indica il nome.'), minLength(2), maxLength(50), personName),
            lastName: check(v.lastName, required('Indica il cognome.'), minLength(2), maxLength(50), personName),
            title: check(v.title, required('Indica la tua qualifica.'), minLength(2), maxLength(100)),
        };
    }
    return {
        ...common,
        structureName: check(v.structureName, required('Indica il nome della struttura.'), minLength(2), maxLength(120)),
        structureType: check(v.structureType, maxLength(80)),
        address: check(v.address, maxLength(160)),
        postalCode: check(v.postalCode, postalCode),
        vatNumber: check(v.vatNumber, vatNumber),
        poolLength: check(v.poolLength, integerBetween(10, 100, 'Indica una lunghezza tra 10 e 100 metri.')),
        lanes: check(v.lanes, integerBetween(1, 20, 'Indica un numero di corsie tra 1 e 20.')),
    };
};

interface Props {
    open: boolean;
    profile: UserProfile | StructureProfile;
    onClose: () => void;
    onSaved: (profile: UserProfile | StructureProfile) => void;
}

/** Modifica dei dati del profilo, per professionisti e strutture. */
export const ProfileEditModal: React.FC<Props> = ({ open, profile, onClose, onSaved }) => {
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const isProfessional = profile.userType === 'professional';
    const validate = useCallback((v: Values) => validateProfile(v, isProfessional), [isProfessional]);
    const form = useForm<Values>(toValues(profile), validate);
    const { values, errors, bind, set, reset } = form;

    useEffect(() => {
        if (open) reset(toValues(profile));
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        const trim = (s: string) => s.trim().replace(/\s+/g, ' ');
        const common = {
            city: trim(v.city),
            province: v.province.toUpperCase(),
            phone: v.phone.trim() ? normalizePhone(v.phone).replace(/^0039/, '+39') : '',
            website: normalizeUrl(v.website),
            bio: v.bio.trim(),
        };
        const data = isProfessional
            ? { ...common, firstName: trim(v.firstName), lastName: trim(v.lastName), title: trim(v.title), languages: v.languages.slice(0, 8) }
            : {
                  ...common,
                  structureName: trim(v.structureName),
                  structureType: trim(v.structureType),
                  address: trim(v.address),
                  postalCode: v.postalCode.trim(),
                  vatNumber: v.vatNumber.replace(/^IT/i, '').replace(/\s/g, ''),
                  poolLength: v.poolLength ? Number(v.poolLength) : null,
                  lanes: v.lanes ? Number(v.lanes) : null,
                  poolSetting: (v.poolSetting || null) as StructureProfile['poolSetting'],
                  services: v.services.slice(0, POOL_SERVICES.length),
              };
        try {
            const updated = await databaseService.updateProfile(profile.userId || profile.$id, data);
            onSaved({ ...profile, ...updated } as UserProfile | StructureProfile);
            showToast('Profilo aggiornato.', 'success');
            onClose();
        } catch (error) {
            console.error('Aggiornamento profilo:', error);
            showToast('Non è stato possibile salvare il profilo. Riprova.', 'error');
        } finally {
            setSaving(false);
        }
    });

    return (
        <FormModal
            open={open}
            size="lg"
            title={isProfessional ? 'Modifica il profilo' : 'Modifica la struttura'}
            description="I campi senza “facoltativo” sono necessari per comparire nelle ricerche."
            icon="edit"
            dirty={form.isDirty}
            busy={saving}
            submitLabel="Salva"
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
        >
            {isProfessional ? (
                <FormSection title="Chi sei">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field id="pe-first" label="Nome" error={errors.firstName}>
                            <input {...bind('firstName')} autoComplete="given-name" maxLength={60} />
                        </Field>
                        <Field id="pe-last" label="Cognome" error={errors.lastName}>
                            <input {...bind('lastName')} autoComplete="family-name" maxLength={60} />
                        </Field>
                    </div>
                    <Field id="pe-title" label="Qualifica" error={errors.title} hint="Compare sotto il tuo nome in tutto SwimIn.">
                        <input {...bind('title')} list="pe-title-options" placeholder="Es. Istruttore di nuoto FIN" maxLength={110} />
                    </Field>
                    <Suggestions id="pe-title-options" options={PROFESSIONAL_ROLES} />
                </FormSection>
            ) : (
                <FormSection title="La struttura">
                    <Field id="pe-sname" label="Nome della struttura" error={errors.structureName}>
                        <input {...bind('structureName')} autoComplete="organization" maxLength={130} />
                    </Field>
                    <Field id="pe-stype" label="Tipo" optional error={errors.structureType}>
                        <input {...bind('structureType')} list="pe-stype-options" placeholder="Es. Piscina comunale" maxLength={90} />
                    </Field>
                    <Suggestions id="pe-stype-options" options={STRUCTURE_TYPES} />
                    <Field id="pe-vat" label="Partita IVA" optional error={errors.vatNumber} hint="Non viene mostrata sul profilo: serve a verificare la struttura.">
                        <input {...bind('vatNumber')} inputMode="numeric" placeholder="11 cifre" maxLength={16} autoComplete="off" />
                    </Field>
                </FormSection>
            )}

            <FormSection title={isProfessional ? 'Dove lavori' : 'Sede'}>
                {!isProfessional && (
                    <Field id="pe-address" label="Indirizzo" optional error={errors.address}>
                        <input {...bind('address')} placeholder="Es. Viale Tunisia 35" autoComplete="street-address" maxLength={170} />
                    </Field>
                )}
                <div className={`grid grid-cols-1 gap-4 ${isProfessional ? 'sm:grid-cols-2' : 'sm:grid-cols-[1fr_1fr_8rem]'}`}>
                    <Field id="pe-city" label="Città" error={errors.city}>
                        <input {...bind('city')} placeholder="Es. Milano" autoComplete="address-level2" maxLength={90} />
                    </Field>
                    <Field id="pe-prov" label="Provincia" error={errors.province}>
                        <ProvinceSelect value={values.province} onChange={(c) => set('province', c)} onBlur={() => form.touch('province')} />
                    </Field>
                    {!isProfessional && (
                        <Field id="pe-cap" label="CAP" optional error={errors.postalCode}>
                            <input {...bind('postalCode')} inputMode="numeric" maxLength={5} autoComplete="postal-code" />
                        </Field>
                    )}
                </div>
            </FormSection>

            <FormSection title="Contatti" description="Visibili agli utenti registrati di SwimIn.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field id="pe-phone" label="Telefono" optional error={errors.phone}>
                        <input {...bind('phone')} type="tel" inputMode="tel" placeholder="Es. +39 333 123 4567" autoComplete="tel" maxLength={24} />
                    </Field>
                    <Field id="pe-web" label={isProfessional ? 'Sito o portfolio' : 'Sito web'} optional error={errors.website}>
                        <input {...bind('website')} type="url" inputMode="url" placeholder="Es. www.piscina.it" autoComplete="url" maxLength={500} />
                    </Field>
                </div>
            </FormSection>

            {!isProfessional && (
                <FormSection title="L’impianto" description="Aiuta i professionisti a capire dove andranno a lavorare.">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Field id="pe-length" label="Vasca principale" optional error={errors.poolLength}>
                            <select {...bind('poolLength')}>
                                <option value="">—</option>
                                {['25', '33', '50'].map((m) => (
                                    <option key={m} value={m}>{m} metri</option>
                                ))}
                                {values.poolLength && !['25', '33', '50'].includes(values.poolLength) && <option value={values.poolLength}>{values.poolLength} metri</option>}
                            </select>
                        </Field>
                        <Field id="pe-lanes" label="Corsie" optional error={errors.lanes}>
                            <input {...bind('lanes')} type="number" inputMode="numeric" min={1} max={20} step={1} placeholder="Es. 6" />
                        </Field>
                        <Field id="pe-setting" label="Vasche" optional className="col-span-2 sm:col-span-1">
                            <select {...bind('poolSetting')}>
                                <option value="">—</option>
                                {POOL_SETTINGS.map((p) => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-abisso mb-2">Attività proposte</p>
                        <ChoiceChips label="Attività proposte" multiple options={POOL_SERVICES.map((s) => ({ value: s, label: s }))} value={values.services} onChange={(next) => set('services', next)} />
                    </div>
                </FormSection>
            )}

            {isProfessional && (
                <FormSection title="Lingue" description="Utile per lavorare con turisti o allievi stranieri.">
                    <ChoiceChips label="Lingue" multiple max={8} options={LANGUAGES.map((l) => ({ value: l, label: l }))} value={values.languages} onChange={(next) => set('languages', next)} />
                </FormSection>
            )}

            <FormSection title="Presentazione">
                <Field
                    id="pe-bio"
                    label={isProfessional ? 'Chi sono' : 'Chi siamo'}
                    optional
                    error={errors.bio}
                    count={{ value: values.bio, max: BIO_MAX }}
                    hint={isProfessional ? 'Due o tre frasi: con chi lavori meglio, in quali vasche, cosa ti distingue.' : 'Servizi, orari, ambiente di lavoro, cosa offrite allo staff.'}
                >
                    <textarea {...bind('bio')} rows={5} className={fieldClass(errors.bio, 'resize-y min-h-[7rem]')} />
                </Field>
            </FormSection>
        </FormModal>
    );
};
