import React, { useCallback, useEffect, useState } from 'react';
import { databaseService, type BreachInput, type DataBreach } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { FormModal } from '@/components/form/FormModal';
import { ChoiceChips, Field, fieldClass } from '@/components/form/Field';
import { DatePicker, TimePicker } from '@/components/form/Pickers';
import { PageLoader } from '@/components/common/PageLoader';
import { Button } from '@/components/ui/Button';
import { todayISO } from '@/utils/dates';

const RISK: Record<DataBreach['risk'], { label: string; hint: string; cls: string }> = {
    low: { label: 'Basso', hint: 'Si documenta qui, senza avviso al Garante (es. file cifrato perso, nessun accesso).', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
    medium: { label: 'Medio', hint: 'Avviso al Garante entro 72 ore dalla scoperta.', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    high: { label: 'Alto', hint: 'Avviso al Garante entro 72 ore e alle persone coinvolte senza ritardo.', cls: 'bg-red-50 text-galleggiante-700 border-red-200' },
};

/** Data e ora locali ↔ ISO. */
const split = (iso: string) => {
    if (!iso) return { date: '', time: '' };
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const join = (date: string, time: string) => (date ? new Date(`${date}T${time || '00:00'}`).toISOString() : '');
const when = (iso: string) => new Date(iso).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

const EMPTY: BreachInput = { title: '', description: '', detectedAt: '', dataCategories: '', affectedCount: 0, risk: 'medium', status: 'open', garanteNotifiedAt: '', usersNotifiedAt: '', measures: '' };

const DateTimeField: React.FC<{ id: string; label: string; value: string; onChange: (iso: string) => void; optional?: boolean }> = ({ id, label, value, onChange, optional }) => {
    const { date, time } = split(value);
    return (
        <Field id={id} label={label} optional={optional}>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                <DatePicker label={label} value={date} max={todayISO()} onChange={(d) => onChange(join(d, time))} />
                <TimePicker label={`${label}, ora`} value={time} from="00:00" to="23:45" onChange={(t) => onChange(join(date, t))} />
            </div>
        </Field>
    );
};

/**
 * Registro delle violazioni dei dati personali (GDPR art. 33.5): ogni episodio va documentato.
 * Con rischio medio o alto il Garante va avvisato entro 72 ore; con rischio alto anche le persone.
 */
export const AdminBreaches: React.FC = () => {
    const { showToast } = useToast();
    const [rows, setRows] = useState<DataBreach[] | null>(null);
    const [form, setForm] = useState<BreachInput | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setRows(await databaseService.adminListBreaches());
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Registro non caricato.', 'error');
            setRows([]);
        }
    }, [showToast]);
    useEffect(() => { void load(); }, [load]);

    const set = <K extends keyof BreachInput>(k: K, v: BreachInput[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        setBusy(true);
        try {
            await databaseService.adminSaveBreach(form);
            setForm(null);
            showToast(form.breachId ? 'Registro aggiornato.' : 'Violazione registrata: gli amministratori sono stati avvisati.', 'success');
            await load();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Salvataggio non riuscito.', 'error');
        } finally {
            setBusy(false);
        }
    };

    if (!rows) return <PageLoader variant="list" />;

    return (
        <div className="space-y-5">
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold text-abisso leading-tight">Violazioni dei dati</h2>
                    <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                        Registra subito ogni episodio in cui dati personali sono stati persi, esposti o modificati senza permesso, anche se sembra innocuo.
                        Con rischio medio o alto l’avviso al Garante va fatto entro 72 ore dalla scoperta dal sito del Garante (servizio di notifica delle violazioni).
                    </p>
                </div>
                <Button icon="plus" onClick={() => setForm({ ...EMPTY, detectedAt: new Date().toISOString() })}>Registra una violazione</Button>
            </section>

            {rows.length === 0 ? (
                <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Nessuna violazione registrata.</p>
            ) : (
                <ul className="space-y-3">
                    {rows.map((b) => (
                        <li key={b.$id} className="bg-white rounded-2xl border border-slate-200 p-5">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className={`font-semibold px-2 py-0.5 rounded-full border ${RISK[b.risk].cls}`}>Rischio {RISK[b.risk].label.toLowerCase()}</span>
                                <span className={`font-semibold px-2 py-0.5 rounded-full border ${b.status === 'open' ? 'bg-corsia-50 text-corsia-800 border-corsia-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{b.status === 'open' ? 'Aperta' : 'Chiusa'}</span>
                                {b.overdue && <span className="font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-galleggiante-700 border-red-200">Avviso al Garante in ritardo</span>}
                            </div>
                            <h3 className="mt-2 font-semibold text-abisso break-words">{b.title}</h3>
                            <p className="text-sm text-slate-600 mt-1 break-words">{b.description}</p>
                            <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                <div><dt className="inline text-slate-500">Scoperta: </dt><dd className="inline text-abisso">{when(b.detectedAt)}</dd></div>
                                <div><dt className="inline text-slate-500">Persone coinvolte: </dt><dd className="inline text-abisso">{b.affectedCount || 'da stimare'}</dd></div>
                                {b.required && (
                                    <div><dt className="inline text-slate-500">Garante: </dt><dd className="inline text-abisso">{b.garanteNotifiedAt ? `avvisato il ${when(b.garanteNotifiedAt)}` : `da avvisare entro il ${when(b.due)}`}</dd></div>
                                )}
                                {b.risk === 'high' && (
                                    <div><dt className="inline text-slate-500">Persone: </dt><dd className="inline text-abisso">{b.usersNotifiedAt ? `avvisate il ${when(b.usersNotifiedAt)}` : 'da avvisare'}</dd></div>
                                )}
                            </dl>
                            <Button size="sm" variant="secondary" className="mt-3" onClick={() => setForm({ breachId: b.$id, title: b.title, description: b.description, detectedAt: b.detectedAt, dataCategories: b.dataCategories, affectedCount: b.affectedCount, risk: b.risk, status: b.status, garanteNotifiedAt: b.garanteNotifiedAt, usersNotifiedAt: b.usersNotifiedAt, measures: b.measures })}>
                                Aggiorna
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            {form && (
                <FormModal open size="lg" title={form.breachId ? 'Aggiorna la violazione' : 'Registra una violazione'} icon="shield" busy={busy} submitLabel="Salva nel registro" onClose={() => setForm(null)} onSubmit={save} dirty>
                    <div className="space-y-4">
                        <Field id="breach-title" label="Cosa è successo">
                            <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="Es. CV visibili tramite un link condiviso per errore" />
                        </Field>
                        <Field id="breach-description" label="Descrizione" hint="Come è stato scoperto, quali dati, da quando, chi poteva vederli.">
                            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} maxLength={4000} className={fieldClass(undefined, 'resize-y')} />
                        </Field>
                        <DateTimeField id="breach-detected" label="Scoperta il" value={form.detectedAt} onChange={(v) => set('detectedAt', v)} />
                        <div>
                            <ChoiceChips label="Rischio per le persone" options={(Object.keys(RISK) as DataBreach['risk'][]).map((value) => ({ value, label: RISK[value].label }))} value={[form.risk]} onChange={(v) => set('risk', v[0])} />
                            <p className="text-sm text-slate-500 mt-1.5">{RISK[form.risk].hint}</p>
                        </div>
                        <div className="grid sm:grid-cols-[minmax(0,1fr)_10rem] gap-4">
                            <Field id="breach-categories" label="Dati coinvolti" optional>
                                <input value={form.dataCategories} onChange={(e) => set('dataCategories', e.target.value)} maxLength={500} placeholder="Es. nome, email, CV" />
                            </Field>
                            <Field id="breach-count" label="Persone coinvolte" optional>
                                <input type="number" inputMode="numeric" min={0} value={form.affectedCount || ''} onChange={(e) => set('affectedCount', Number(e.target.value) || 0)} />
                            </Field>
                        </div>
                        {form.risk !== 'low' && <DateTimeField id="breach-garante" label="Garante avvisato il" optional value={form.garanteNotifiedAt} onChange={(v) => set('garanteNotifiedAt', v)} />}
                        {form.risk === 'high' && <DateTimeField id="breach-users" label="Persone avvisate il" optional value={form.usersNotifiedAt} onChange={(v) => set('usersNotifiedAt', v)} />}
                        <Field id="breach-measures" label="Misure prese" optional hint="Cosa è stato fatto per fermarla e perché non si ripeta.">
                            <textarea value={form.measures} onChange={(e) => set('measures', e.target.value)} rows={3} maxLength={4000} className={fieldClass(undefined, 'resize-y')} />
                        </Field>
                        <ChoiceChips label="Stato" options={[{ value: 'open' as const, label: 'Aperta' }, { value: 'closed' as const, label: 'Chiusa' }]} value={[form.status]} onChange={(v) => set('status', v[0])} />
                    </div>
                </FormModal>
            )}
        </div>
    );
};
