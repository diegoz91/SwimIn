import React, { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Checkbox, Field } from '@/components/form/Field';
import { ProvinceSelect, Select } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useToast } from '@/context/ToastContext';
import { ApiError, databaseService, type JobAlert } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import { isPremium } from '@/utils/premium';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { JOB_CONTRACTS, contractLabel } from '@/data/swimming';
import { provinceName } from '@/data/italy';
import { check, maxLength, province } from '@/utils/validation';

type Values = { query: string; province: string; contractType: string; sosOnly: boolean };

const validate = (v: Values): FormErrors<Values> => ({
    query: check(v.query, maxLength(60)) || (!v.query.trim() && !v.province && !v.contractType && !v.sosOnly ? 'Indica almeno una parola chiave, una provincia o un contratto.' : undefined),
    province: check(v.province, province),
});

export const describeAlert = (a: Pick<JobAlert, 'query' | 'province' | 'contractType' | 'sosOnly'>) =>
    [
        a.query ? `“${a.query}”` : 'Tutte le offerte',
        a.province ? `in provincia di ${provinceName(a.province) || a.province}` : 'in tutta Italia',
        a.contractType ? contractLabel(a.contractType).toLowerCase() : '',
        a.sosOnly ? 'solo sostituzioni urgenti' : '',
    ].filter(Boolean).join(', ');

/** Avvisi di lavoro: ricerche salvate che mandano una notifica a ogni nuovo annuncio adatto. */
export const JobAlertsModal: React.FC<{ open: boolean; onClose: () => void; initial?: Partial<Values> }> = ({ open, onClose, initial }) => {
    const { showToast } = useToast();
    const { user } = useAuth();
    // Limiti verificati dalla Function (BASE_ALERTS / PREMIUM_ALERTS in billing.js).
    const premium = isPremium(user);
    const limit = premium ? 10 : 2;
    const [alerts, setAlerts] = useState<JobAlert[] | null>(null);
    const [saving, setSaving] = useState(false);
    const start = (): Values => ({ query: initial?.query || '', province: initial?.province || '', contractType: initial?.contractType || '', sosOnly: false });
    const form = useForm<Values>(start(), useCallback(validate, []));
    const { values, errors, bind, set } = form;

    useEffect(() => {
        if (!open) return;
        form.reset(start());
        setAlerts(null);
        databaseService.listJobAlerts().then(setAlerts).catch((err) => { console.error('Avvisi:', err); setAlerts([]); });
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        try {
            const created = await databaseService.createJobAlert({ query: v.query.trim(), province: v.province, contractType: v.contractType, sosOnly: v.sosOnly });
            setAlerts((prev) => [created, ...(prev || []).filter((a) => a.$id !== created.$id)]);
            showToast('Avviso salvato: ti scriviamo appena esce un annuncio adatto.', 'success');
            form.reset({ query: '', province: '', contractType: '', sosOnly: false });
        } catch (err) {
            // Limite del piano Base: si apre da solo l'invito a Premium.
            if (!(err instanceof ApiError && err.code === 'premium_required')) showToast(err instanceof Error ? err.message : 'Avviso non salvato.', 'error');
        } finally {
            setSaving(false);
        }
    });

    const remove = async (a: JobAlert) => {
        try {
            await databaseService.deleteJobAlert(a.$id);
            setAlerts((prev) => (prev || []).filter((x) => x.$id !== a.$id));
            showToast('Avviso eliminato.', 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
        }
    };

    return (
        <FormModal
            open={open}
            title="Avvisi di lavoro"
            description="Ricevi una notifica (e una email, se l’hai attivata) appena una struttura pubblica un annuncio adatto a te."
            icon="bell"
            dirty={false}
            busy={saving}
            submitLabel="Salva avviso"
            busyLabel="Salvataggio…"
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
        >
            <section aria-labelledby="my-alerts">
                <h3 id="my-alerts" className="text-sm font-semibold text-abisso mb-2">I tuoi avvisi</h3>
                {alerts === null ? (
                    <div className="h-12 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />
                ) : alerts.length === 0 ? (
                    <p className="text-sm text-slate-500">Nessun avviso. Creane uno qui sotto.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                        {alerts.map((a) => (
                            <li key={a.$id} className="flex items-center gap-3 px-3 py-2.5">
                                <Icon type="bell" className="w-4 h-4 text-corsia-600 flex-shrink-0" />
                                <span className="min-w-0 flex-1 text-sm text-slate-700 first-letter:uppercase">{describeAlert(a)}</span>
                                <button type="button" onClick={() => remove(a)} aria-label={`Elimina l’avviso ${describeAlert(a)}`} className="p-2 -m-1 rounded-full text-slate-400 hover:text-galleggiante-700 hover:bg-red-50">
                                    <Icon type="trash" className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <div className="pt-2 border-t border-slate-100">
                <h3 className="text-sm font-semibold text-abisso flex items-baseline justify-between gap-3">
                    Nuovo avviso
                    {alerts && <span className="text-xs font-normal text-slate-500 tabular-nums">{alerts.length} di {limit}</span>}
                </h3>
                {!premium && (
                    <p className="text-xs text-slate-500 mt-1">
                        Con il piano Base puoi salvare 2 avvisi; con{' '}
                        <Link to="/premium" onClick={onClose} className="font-semibold text-oro-700 hover:underline py-1 -my-1">Premium</Link>{' '}
                        fino a 10.
                    </p>
                )}
            </div>
            <Field id="alert-query" label="Parole chiave" optional error={errors.query} hint="Ruolo o parole dell’annuncio, es. “assistente bagnanti” o “istruttore neonatale”.">
                <input {...bind('query')} maxLength={70} placeholder="Es. istruttore" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="alert-province" label="Provincia" optional error={errors.province} hint="Vuoto: tutta Italia.">
                    <ProvinceSelect value={values.province} onChange={(c) => set('province', c)} onBlur={() => form.touch('province')} />
                </Field>
                <Field id="alert-contract" label="Contratto" optional>
                    <Select label="Contratto" value={values.contractType} onChange={(c) => set('contractType', c)} placeholder="Qualsiasi contratto" clearLabel="Qualsiasi contratto" options={JOB_CONTRACTS} />
                </Field>
            </div>
            <Checkbox id="alert-sos" checked={values.sosOnly} onChange={(c) => set('sosOnly', c)} label="Solo sostituzioni urgenti" description="Turni scoperti da coprire a breve." />
        </FormModal>
    );
};
