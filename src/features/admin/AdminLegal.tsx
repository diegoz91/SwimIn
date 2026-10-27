import React, { useCallback, useEffect, useState } from 'react';
import { databaseService, type AdminUserRow, type LegalHold, type LegalHoldInput } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { check, minLength, required, isoDate, notAfter } from '@/utils/validation';
import { Checkbox, ChoiceChips, Field, fieldClass } from '@/components/form/Field';
import { DatePicker, Select } from '@/components/form/Pickers';
import { FormModal } from '@/components/form/FormModal';
import { PageLoader } from '@/components/common/PageLoader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatDate, todayISO } from '@/utils/dates';
import { downloadText } from '@/utils/shiftExport';

const DAYS = [30, 60, 90, 180, 365].map((d) => ({ value: String(d), label: `${d} giorni` }));
const STATUS: Record<LegalHold['status'], { label: string; cls: string }> = {
    active: { label: 'Attiva', cls: 'bg-abisso text-white border-abisso' },
    released: { label: 'Chiusa', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
    expired: { label: 'Scaduta', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Ricerca di un utente tra gli account (riusa la ricerca del pannello amministratori). */
const PersonPicker: React.FC<{ id: string; label: string; value: AdminUserRow | null; onChange: (u: AdminUserRow | null) => void; error?: string }> = ({ id, label, value, onChange, error }) => {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<AdminUserRow[]>([]);
    useEffect(() => {
        if (value || q.trim().length < 2) return setRows([]);
        const t = window.setTimeout(() => databaseService.adminSearchUsers(q).then(setRows).catch((e) => { console.warn('Ricerca utenti:', e); setRows([]); }), 300);
        return () => window.clearTimeout(t);
    }, [q, value]);
    if (value) {
        return (
            <div>
                <p className="text-sm font-semibold text-abisso mb-1.5">{label}</p>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-abisso truncate">{value.name}</p>
                        <p className="text-xs text-slate-500 truncate">{[value.email, value.$id].join(' · ')}</p>
                    </div>
                    <Button size="sm" variant="quiet" onClick={() => onChange(null)}>Cambia</Button>
                </div>
            </div>
        );
    }
    return (
        <div>
            <Field id={id} label={label} error={error} hint="Nome, cognome o email dell'account.">
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" className={fieldClass(error)} />
            </Field>
            {rows.length > 0 && (
                <ul className="mt-2 rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {rows.map((u) => (
                        <li key={u.$id}>
                            <button type="button" onClick={() => onChange(u)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 focus-visible:bg-slate-50 outline-none">
                                <span className="block font-semibold text-abisso">{u.name}</span>
                                <span className="block text-xs text-slate-500 truncate">{u.email}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

type HoldForm = { subjectType: 'user' | 'conversation'; authority: string; reference: string; orderDate: string; days: string; reason: string };
const EMPTY: HoldForm = { subjectType: 'user', authority: '', reference: '', orderDate: '', days: '90', reason: '' };
const validateHold = (v: HoldForm): FormErrors<HoldForm> => ({
    authority: check(v.authority, required('Indica l’autorità che ha emesso l’ordine.'), minLength(3)),
    reference: check(v.reference, required('Indica il protocollo o il riferimento.'), minLength(2)),
    orderDate: check(v.orderDate, required('Indica la data dell’ordine.'), isoDate, notAfter(todayISO(), 'La data non può essere futura.')),
    reason: check(v.reason, required('Indica come è arrivato l’ordine (es. PEC del 12/10).'), minLength(5, 'Almeno 5 caratteri.')),
});

const NewHoldModal: React.FC<{ open: boolean; onClose: () => void; onCreated: () => void }> = ({ open, onClose, onCreated }) => {
    const { showToast } = useToast();
    const form = useForm<HoldForm>(EMPTY, validateHold);
    const [person, setPerson] = useState<AdminUserRow | null>(null);
    const [other, setOther] = useState<AdminUserRow | null>(null);
    const [busy, setBusy] = useState(false);
    const [peopleError, setPeopleError] = useState('');

    const close = () => {
        form.reset(EMPTY);
        setPerson(null);
        setOther(null);
        setPeopleError('');
        onClose();
    };

    const submit = form.handleSubmit(async (v) => {
        if (!person || (v.subjectType === 'conversation' && (!other || other.$id === person.$id))) {
            setPeopleError(v.subjectType === 'conversation' ? 'Scegli due persone diverse.' : 'Scegli la persona.');
            return;
        }
        setBusy(true);
        try {
            const input: LegalHoldInput = { subjectType: v.subjectType, userId: person.$id, otherUserId: other?.$id, authority: v.authority, reference: v.reference, orderDate: v.orderDate, days: Number(v.days), reason: v.reason };
            const hold = await databaseService.legalCreateHold(input);
            showToast(`Conservazione registrata: ${hold.items} copie sigillate.`, 'success');
            onCreated();
            close();
        } catch (e) {
            showToast(errorText(e, 'Conservazione non registrata.'), 'error');
        } finally {
            setBusy(false);
        }
    });

    return (
        <FormModal
            open={open}
            title="Registra un ordine di conservazione"
            description="SwimIn fa subito una copia sigillata dei dati di oggi: resta anche se l’utente li cancella e si apre solo con la chiave custodita fuori linea."
            icon="shield"
            dirty={form.isDirty || !!person}
            busy={busy}
            busyLabel="Copia in corso…"
            submitLabel="Registra e sigilla"
            onClose={close}
            onSubmit={submit}
            formRef={form.formRef}
        >
            <div className="space-y-5">
                <ChoiceChips<HoldForm['subjectType']>
                    label="Cosa conservare"
                    options={[{ value: 'user', label: 'Tutti i dati di una persona' }, { value: 'conversation', label: 'Una conversazione' }]}
                    value={[form.values.subjectType]}
                    onChange={(x) => form.set('subjectType', x[0] || 'user')}
                />
                <PersonPicker id="hold-person" label={form.values.subjectType === 'conversation' ? 'Prima persona' : 'Persona'} value={person} onChange={(u) => { setPerson(u); setPeopleError(''); }} error={!person ? peopleError : undefined} />
                {form.values.subjectType === 'conversation' && (
                    <PersonPicker id="hold-other" label="Seconda persona" value={other} onChange={(u) => { setOther(u); setPeopleError(''); }} error={person ? peopleError : undefined} />
                )}
                <Field id="hold-authority" label="Autorità" error={form.errors.authority} hint="Es. Procura della Repubblica di Milano, Polizia Postale.">
                    <input {...form.bind('authority')} maxLength={200} />
                </Field>
                <div className="grid sm:grid-cols-2 gap-4">
                    <Field id="hold-reference" label="Protocollo o riferimento" error={form.errors.reference}>
                        <input {...form.bind('reference')} maxLength={100} />
                    </Field>
                    <Field id="hold-date" label="Data dell’ordine" error={form.errors.orderDate}>
                        <DatePicker label="Data dell’ordine" {...form.field('orderDate')} max={todayISO()} />
                    </Field>
                </div>
                <Field id="hold-days" label="Durata della conservazione" hint="L’ordine europeo prevede 60 giorni, prorogabili di 30.">
                    <Select label="Durata della conservazione" value={form.values.days} onChange={(v) => form.set('days', v)} options={DAYS} />
                </Field>
                <Field id="hold-reason" label="Come è arrivato l’ordine" error={form.errors.reason} count={{ value: form.values.reason, max: 500 }}>
                    <textarea {...form.bind('reason')} rows={2} maxLength={500} />
                </Field>
            </div>
        </FormModal>
    );
};

type Step = { kind: 'export' | 'extend' | 'release'; hold: LegalHold };
const STEP_TEXT: Record<Step['kind'], { title: string; description: string; submit: string; busy: string; placeholder: string }> = {
    export: { title: 'Esporta per la consegna', description: 'Scarichi un file cifrato con l’impronta di ogni copia. Si apre solo con la chiave privata (scripts/legal/decrypt.mjs).', submit: 'Scarica il file cifrato', busy: 'Preparazione…', placeholder: 'Es. Consegna alla Procura, richiesta prot. 55/2026' },
    extend: { title: 'Proroga la conservazione', description: 'La scadenza si sposta in avanti. Puoi anche aggiungere una nuova copia dei dati di oggi.', submit: 'Proroga', busy: 'Proroga…', placeholder: 'Es. Proroga chiesta dall’autorità con PEC del 3/11' },
    release: { title: 'Chiudi la conservazione', description: 'Le copie sigillate vengono cancellate subito e non si possono recuperare.', submit: 'Chiudi e cancella le copie', busy: 'Chiusura…', placeholder: 'Es. Procedimento concluso, comunicazione del 20/11' },
};

const StepModal: React.FC<{ step: Step | null; onClose: () => void; onDone: () => void }> = ({ step, onClose, onDone }) => {
    const { showToast } = useToast();
    const [reason, setReason] = useState('');
    const [days, setDays] = useState('30');
    const [refresh, setRefresh] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        setReason('');
        setDays('30');
        setRefresh(false);
        setError('');
    }, [step]);
    if (!step) return null;
    const text = STEP_TEXT[step.kind];

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (reason.trim().length < 5) return setError('Indica il motivo: resta nel registro degli accessi.');
        setBusy(true);
        try {
            if (step.kind === 'export') {
                const pkg = await databaseService.legalExportHold(step.hold.$id, reason.trim());
                const safeRef = step.hold.reference.replace(/[^\w-]+/g, '_').slice(0, 40);
                downloadText(`conservazione-${safeRef}-${todayISO()}.json`, JSON.stringify(pkg, null, 2), 'application/json');
                showToast('File cifrato scaricato.', 'success');
            } else if (step.kind === 'extend') {
                const r = await databaseService.legalExtendHold(step.hold.$id, Number(days), refresh, reason.trim());
                showToast(`Prorogata fino al ${formatDate(r.until)}${r.added ? `, ${r.added} nuove copie` : ''}.`, 'success');
            } else {
                await databaseService.legalReleaseHold(step.hold.$id, reason.trim());
                showToast('Conservazione chiusa, copie cancellate.', 'success');
            }
            onDone();
            onClose();
        } catch (err) {
            showToast(errorText(err, 'Operazione non riuscita.'), 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <FormModal open title={text.title} description={text.description} icon={step.kind === 'export' ? 'download' : step.kind === 'release' ? 'trash' : 'clock'} tone={step.kind === 'release' ? 'danger' : 'default'} busy={busy} busyLabel={text.busy} submitLabel={text.submit} dirty={!!reason} onClose={onClose} onSubmit={submit}>
            <div className="space-y-5">
                <p className="text-sm text-slate-600">{step.hold.authority} · rif. {step.hold.reference}</p>
                {step.kind === 'extend' && (
                    <>
                        <Field id="step-days" label="Di quanto">
                            <Select label="Di quanto" value={days} onChange={setDays} options={DAYS} />
                        </Field>
                        <Checkbox id="step-refresh" checked={refresh} onChange={setRefresh} label="Aggiungi una copia dei dati di oggi" description="Utile se l’autorità chiede anche quanto è successo dopo il primo ordine." />
                    </>
                )}
                <Field id="step-reason" label="Motivo" error={error} count={{ value: reason, max: 500 }}>
                    <textarea value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} rows={2} maxLength={500} placeholder={text.placeholder} />
                </Field>
            </div>
        </FormModal>
    );
};

/**
 * Richieste delle autorità (solo etichette `admin` + `legal`): ordini di conservazione con copie
 * sigillate, proroga, esportazione cifrata per la consegna e chiusura. Tutto finisce nel registro.
 */
export const AdminLegal: React.FC = () => {
    const { showToast } = useToast();
    const [holds, setHolds] = useState<LegalHold[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [step, setStep] = useState<Step | null>(null);

    const load = useCallback(async () => {
        try {
            setHolds(await databaseService.legalListHolds());
        } catch (e) {
            showToast(errorText(e, 'Richieste non caricate.'), 'error');
            setHolds([]);
        }
    }, [showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-4">
                <span className="w-11 h-11 rounded-full bg-corsia-50 text-corsia-700 flex items-center justify-center flex-shrink-0"><Icon type="lock-closed" className="w-5 h-5" /></span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold text-abisso leading-tight">Richieste delle autorità</h2>
                    <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                        Quando arriva un ordine di conservazione o di consegna, registralo qui. SwimIn sigilla subito i dati esistenti (account, accessi, profilo, messaggi, post, commenti, candidature): nessuno li può leggere dal sistema, nemmeno gli amministratori. Alla scadenza le copie si cancellano da sole.
                    </p>
                </div>
                <Button icon="plus" onClick={() => setCreating(true)} className="flex-shrink-0">Registra un ordine</Button>
            </div>

            {holds === null ? (
                <PageLoader variant="list" />
            ) : holds.length === 0 ? (
                <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Nessuna richiesta registrata.</p>
            ) : (
                <ul className="space-y-3">
                    {holds.map((h) => (
                        <li key={h.$id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS[h.status].cls}`}>{STATUS[h.status].label}</span>
                                <p className="font-semibold text-abisso min-w-0">{h.authority}</p>
                                <p className="text-sm text-slate-600">rif. {h.reference}</p>
                            </div>
                            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                                <div className="min-w-0"><dt className="text-slate-500">Oggetto</dt><dd className="text-slate-800 break-all">{h.subjectType === 'conversation' ? 'Conversazione' : 'Persona'} {h.subjectId}</dd></div>
                                <div><dt className="text-slate-500">Ordine del</dt><dd className="text-slate-800">{formatDate(h.orderDate)}</dd></div>
                                <div><dt className="text-slate-500">{h.status === 'active' ? 'Conservata fino al' : h.status === 'expired' ? 'Scaduta il' : 'Chiusa il'}</dt><dd className="text-slate-800">{formatDate(h.status === 'released' && h.releasedAt ? h.releasedAt.slice(0, 10) : h.until)}</dd></div>
                            </dl>
                            {h.status === 'active' && (
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-slate-500 mr-auto">{h.items} copie sigillate</span>
                                    <Button size="sm" variant="secondary" icon="download" onClick={() => setStep({ kind: 'export', hold: h })} disabled={!h.items}>Esporta</Button>
                                    <Button size="sm" variant="quiet" onClick={() => setStep({ kind: 'extend', hold: h })}>Proroga</Button>
                                    <Button size="sm" variant="danger" onClick={() => setStep({ kind: 'release', hold: h })}>Chiudi</Button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <NewHoldModal open={creating} onClose={() => setCreating(false)} onCreated={() => void load()} />
            <StepModal step={step} onClose={() => setStep(null)} onDone={() => void load()} />
        </div>
    );
};
