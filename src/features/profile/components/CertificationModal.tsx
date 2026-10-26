import React, { useCallback, useEffect, useState } from 'react';
import type { Certification } from '@/types/types';
import { FormModal } from '@/components/form/FormModal';
import { Checkbox, Field } from '@/components/form/Field';
import { DatePicker, Select, SuggestInput } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useToast } from '@/context/ToastContext';
import { CERT_CATEGORIES, CERT_ISSUERS, CERT_NAMES, COMMON_CERTS, certCategoryKey } from '@/data/swimming';
import { check, isoDate, maxLength, minLength, notAfter, notBefore, required } from '@/utils/validation';
import { addDaysISO, formatDate, isValidISODate, todayISO } from '@/utils/dates';
import { useConfirm } from '@/context/ConfirmContext';

interface CertificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (certification: Certification) => Promise<void>;
    onDelete?: () => Promise<void>;
    certification?: Certification;
    mode: 'add' | 'edit';
}

type Values = {
    name: string;
    issuer: string;
    category: string;
    issueDate: string;
    expiry: string;
    noExpiry: boolean;
    credentialId: string;
};

const EMPTY: Values = { name: '', issuer: '', category: '', issueDate: '', expiry: '', noExpiry: false, credentialId: '' };

const toValues = (c?: Certification): Values =>
    c
        ? {
              name: c.name || '',
              issuer: c.issuer || '',
              category: certCategoryKey(c.category),
              issueDate: c.issueDate || '',
              expiry: c.expiry || '',
              noExpiry: !c.expiry,
              credentialId: c.credentialId || '',
          }
        : EMPTY;

export const validateCertification = (v: Values, today: string = todayISO()): FormErrors<Values> => ({
    name: check(v.name, required('Indica il nome del brevetto.'), minLength(3), maxLength(120)),
    issuer: check(v.issuer, required('Indica l’ente che l’ha rilasciato.'), minLength(2), maxLength(120)),
    category: check(v.category, required('Scegli una categoria.')),
    issueDate: check(v.issueDate, isoDate, notAfter(today, 'La data di rilascio non può essere nel futuro.'), notBefore('1950-01-01', 'Data non valida.')),
    expiry: v.noExpiry
        ? undefined
        : check(
              v.expiry,
              required('Indica la scadenza, oppure spunta "Non scade".'),
              isoDate,
              notBefore(v.issueDate, 'La scadenza deve essere successiva al rilascio.'),
              notAfter(addDaysISO(today, 365 * 15), 'Scadenza troppo lontana: controlla l’anno.')
          ),
    credentialId: check(v.credentialId, maxLength(40)),
});

export const CertificationModal: React.FC<CertificationModalProps> = ({ isOpen, onClose, onSave, onDelete, certification, mode }) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const validate = useCallback((v: Values) => validateCertification(v), []);
    const form = useForm<Values>(EMPTY, validate);
    const { values, errors, bind, patch, reset } = form;
    const today = todayISO();

    useEffect(() => {
        if (isOpen) reset(toValues(mode === 'edit' ? certification : undefined));
    }, [isOpen, certification, mode, reset]);

    /** Se il nome corrisponde a un brevetto noto, propone ente, categoria e scadenza tipica. */
    const onNameChange = (name: string) => {
        const known = COMMON_CERTS.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
        patch({
            name,
            ...(known && !values.issuer ? { issuer: known.issuer } : {}),
            ...(known && !values.category ? { category: known.category } : {}),
            ...(known && !known.years && !values.expiry ? { noExpiry: true } : {}),
        });
    };

    /** Con data di rilascio e validità nota, suggerisce la scadenza. */
    const onIssueDateChange = (issueDate: string) => {
        const known = COMMON_CERTS.find((c) => c.name.toLowerCase() === values.name.trim().toLowerCase());
        const suggested = known?.years && isValidISODate(issueDate) && !values.expiry && !values.noExpiry ? addDaysISO(issueDate, Math.round(known.years * 365.25)) : undefined;
        patch({ issueDate, ...(suggested ? { expiry: suggested } : {}) });
    };

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        try {
            const clean: Certification = {
                name: v.name.trim(),
                issuer: v.issuer.trim(),
                category: v.category,
                ...(v.issueDate ? { issueDate: v.issueDate } : {}),
                ...(!v.noExpiry && v.expiry ? { expiry: v.expiry } : {}),
                ...(v.credentialId.trim() ? { credentialId: v.credentialId.trim() } : {}),
            };
            await onSave(clean);
            showToast(mode === 'add' ? 'Brevetto aggiunto.' : 'Brevetto aggiornato.', 'success');
            onClose();
        } catch (error) {
            console.error('Salvataggio brevetto:', error);
            showToast('Non è stato possibile salvare il brevetto. Riprova.', 'error');
        } finally {
            setSaving(false);
        }
    });

    const remove = async () => {
        if (!onDelete || !(await confirm({ title: 'Eliminare questo brevetto?', message: 'Sparisce dal profilo e dal radar delle scadenze delle strutture.', confirmLabel: 'Elimina', tone: 'danger' }))) return;
        setSaving(true);
        try {
            await onDelete();
            showToast('Brevetto eliminato.', 'info');
            onClose();
        } catch (error) {
            console.error('Eliminazione brevetto:', error);
            showToast('Eliminazione non riuscita.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const expired = !values.noExpiry && isValidISODate(values.expiry) && values.expiry < today;

    return (
        <FormModal
            open={isOpen}
            title={mode === 'add' ? 'Aggiungi brevetto' : 'Modifica brevetto'}
            description="Brevetti, abilitazioni e certificazioni con le loro scadenze."
            icon="certificate"
            dirty={form.isDirty}
            busy={saving}
            submitLabel={mode === 'add' ? 'Aggiungi' : 'Salva'}
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
            secondaryAction={
                mode === 'edit' && onDelete ? (
                    <button type="button" onClick={remove} className="text-sm font-semibold text-galleggiante-700 hover:underline">
                        Elimina
                    </button>
                ) : null
            }
        >
            <Field id="cert-name" label="Nome del brevetto" error={errors.name}>
                <SuggestInput value={values.name} onChange={onNameChange} onBlur={() => form.touch('name')} options={CERT_NAMES} label="Brevetti" placeholder="Es. Brevetto Assistente Bagnanti" maxLength={140} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-4">
                <Field id="cert-issuer" label="Ente" error={errors.issuer}>
                    <SuggestInput {...form.field('issuer')} options={CERT_ISSUERS} label="Enti" placeholder="Es. FIN – Federazione Italiana Nuoto" maxLength={140} />
                </Field>
                <Field id="cert-category" label="Categoria" error={errors.category}>
                    <Select {...form.field('category')} label="Categoria" options={CERT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
                </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="cert-issue" label="Data di rilascio" optional error={errors.issueDate}>
                    <DatePicker label="Data di rilascio" value={values.issueDate} max={today} min="1950-01-01" onChange={onIssueDateChange} onBlur={() => form.touch('issueDate')} />
                </Field>
                <Field
                    id="cert-expiry"
                    label="Data di scadenza"
                    error={errors.expiry}
                    hint={values.noExpiry ? 'Senza scadenza' : isValidISODate(values.expiry) && !expired ? `Valido fino al ${formatDate(values.expiry)}` : undefined}
                >
                    <DatePicker label="Data di scadenza" {...form.field('expiry')} min={isValidISODate(values.issueDate) ? values.issueDate : undefined} max={addDaysISO(today, 365 * 15)} disabled={values.noExpiry} />
                </Field>
            </div>
            <Checkbox
                id="cert-no-expiry"
                checked={values.noExpiry}
                onChange={(c) => patch({ noExpiry: c, expiry: c ? '' : values.expiry })}
                label="Non scade"
                description="Per i titoli permanenti, come i brevetti da istruttore federale."
            />
            {expired && (
                <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 animate-in fade-in duration-200">
                    Questo brevetto risulta scaduto: lo salveremo comunque, e sul profilo comparirà come da rinnovare.
                </p>
            )}

            <Field id="cert-id" label="Numero del brevetto o tessera" optional error={errors.credentialId} hint="Utile alle strutture per verificare il titolo.">
                <input {...bind('credentialId')} placeholder="Es. SNS-123456" maxLength={50} autoComplete="off" />
            </Field>
        </FormModal>
    );
};
