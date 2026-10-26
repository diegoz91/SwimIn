import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { databaseService, type AdminPlan, type AdminPlans as AdminPlansData } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { Field, fieldClass } from '@/components/form/Field';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { AUDIENCE_LABEL, PLAN_NAME, euro, type Audience } from '@/utils/premium';
import { formatRelativeTime } from '@/utils/format';

const AUDIENCES: Audience[] = ['person', 'enthusiast', 'structure'];
const AUDIENCE_HINT: Record<Audience, string> = {
    person: 'Istruttori, assistenti bagnanti, allenatori',
    enthusiast: 'Chi nuota per passione',
    structure: 'Piscine e centri sportivi',
};

/** "4,99" → 499 centesimi; null se non è un importo valido. */
const toCents = (v: string): number | null => {
    const t = v.trim().replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Math.round(Number(t) * 100);
};
const toText = (cents: number) => (cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

/**
 * Prezzi dei piani Premium, decisi dagli amministratori. Il server verifica i permessi e i limiti;
 * i nuovi prezzi valgono per i nuovi abbonamenti, chi è già abbonato mantiene il suo.
 */
export const AdminPlans: React.FC = () => {
    const { showToast } = useToast();
    const [data, setData] = useState<AdminPlansData | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const apply = useCallback((d: AdminPlansData) => {
        setData(d);
        setDraft(Object.fromEntries(d.plans.map((p) => [p.key, toText(p.amount)])));
    }, []);

    useEffect(() => {
        databaseService.adminGetPlans().then(apply).catch((e) => showToast(e instanceof Error ? e.message : 'Impossibile caricare i piani.', 'error'));
    }, [apply, showToast]);

    const byKey = useMemo(() => Object.fromEntries((data?.plans || []).map((p) => [p.key, p])) as Record<string, AdminPlan>, [data]);

    if (!data) return <PageLoader />;
    const { min, max } = data.limits;

    const errorOf = (key: string): string | undefined => {
        const cents = toCents(draft[key] ?? '');
        if (cents === null) return 'Scrivi un importo, es. 4,99';
        if (cents < min || cents > max) return `Da ${euro(min)} a ${euro(max)}`;
        const [audience, period] = key.split('_');
        if (period === 'year') {
            const month = toCents(draft[`${audience}_month`] ?? '');
            if (month !== null && cents > month * 12) return 'Non può costare più di 12 mesi';
        }
        return undefined;
    };
    const changes = Object.fromEntries(
        data.plans.flatMap((p) => {
            const cents = toCents(draft[p.key] ?? '');
            return cents !== null && cents !== p.amount ? [[p.key, cents]] : [];
        })
    );
    const changedCount = Object.keys(changes).length;
    const hasErrors = data.plans.some((p) => errorOf(p.key));

    const save = async () => {
        const list = Object.entries(changes).map(([k, v]) => `${PLAN_NAME[byKey[k].audience as Audience]} ${byKey[k].period === 'month' ? 'mensile' : 'annuale'}: ${euro(byKey[k].amount)} → ${euro(v)}`);
        if (!window.confirm(`Aggiornare i prezzi?\n\n${list.join('\n')}\n\nValgono per i nuovi abbonamenti: chi è già abbonato mantiene il prezzo attuale.`)) return;
        setSaving(true);
        try {
            const res = await databaseService.adminUpdatePlans(changes);
            apply(res);
            if (res.warnings?.length) {
                console.warn('Prezzi:', res.warnings);
                showToast('Prezzi salvati. Un servizio di pagamento non ha risposto: il nuovo prezzo si crea al primo abbonamento.', 'info');
            } else showToast('Prezzi aggiornati: la pagina Premium mostra già i nuovi importi.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Salvataggio non riuscito.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 flex gap-3 items-start">
                <Icon type="info" className="w-5 h-5 text-corsia-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-slate-700 space-y-1">
                    <p>Prezzi IVA inclusa. I nuovi importi valgono subito per chi si abbona da ora; chi ha già un abbonamento continua a pagare il prezzo che ha sottoscritto.</p>
                    <p className="text-slate-500">
                        Pagamenti: carta {data.providers.stripe ? 'attiva' : 'non configurata'} · PayPal {data.providers.paypal ? 'attivo' : 'non configurato'}.
                        {!data.providers.stripe && !data.providers.paypal && ' Si configurano con setup-db (vedi docs/SETUP-APPWRITE.md).'}
                    </p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                {AUDIENCES.map((a) => {
                    const month = byKey[`${a}_month`];
                    const year = byKey[`${a}_year`];
                    const monthDraft = toCents(draft[month.key] ?? '');
                    const yearDraft = toCents(draft[year.key] ?? '');
                    const saving = monthDraft && yearDraft ? Math.round((1 - yearDraft / (monthDraft * 12)) * 100) : null;
                    const updated = [month.updatedAt, year.updatedAt].filter(Boolean).sort().at(-1);
                    return (
                        <section key={a} className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 flex flex-col min-w-0" aria-labelledby={`plan-${a}`}>
                            <h2 id={`plan-${a}`} className="text-2xl font-bold text-abisso leading-tight">{AUDIENCE_LABEL[a]}</h2>
                            <p className="text-sm text-slate-500">{PLAN_NAME[a]} · {AUDIENCE_HINT[a]}</p>
                            <div className="mt-4 space-y-3">
                                {[month, year].map((p) => (
                                    <Field
                                        key={p.key}
                                        id={`price-${p.key}`}
                                        label={p.period === 'month' ? 'Mensile' : 'Annuale'}
                                        error={errorOf(p.key)}
                                        hint={p.amount !== p.defaultAmount ? `Predefinito ${euro(p.defaultAmount)}` : undefined}
                                        trailing={<span className="text-slate-500 font-semibold" aria-hidden="true">€</span>}
                                    >
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            value={draft[p.key] ?? ''}
                                            onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                                            className={fieldClass(errorOf(p.key), 'pr-10 tabular-nums')}
                                        />
                                    </Field>
                                ))}
                            </div>
                            <p className="text-sm text-slate-600 mt-3">
                                {yearDraft ? <>Annuale pari a <span className="font-semibold text-abisso">{euro(Math.round(yearDraft / 12))}</span> al mese</> : '—'}
                                {saving !== null && saving > 0 && <>, risparmio {saving}%</>}
                            </p>
                            <dl className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <dt className="text-slate-500">Abbonati attivi</dt>
                                    <dd className="font-display text-3xl font-bold text-abisso leading-none mt-1">{month.subscribers + year.subscribers}</dd>
                                </div>
                                <div>
                                    <dt className="text-slate-500">Mensili / annuali</dt>
                                    <dd className="font-semibold text-abisso mt-1 tabular-nums">{month.subscribers} / {year.subscribers}</dd>
                                </div>
                            </dl>
                            {updated && <p className="text-xs text-slate-500 mt-3">Ultima modifica {formatRelativeTime(updated)}</p>}
                        </section>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
                {changedCount > 0 && <p className="text-sm text-slate-600 mr-auto">{changedCount === 1 ? '1 prezzo modificato' : `${changedCount} prezzi modificati`}</p>}
                <button
                    type="button"
                    onClick={() => apply(data)}
                    disabled={!changedCount || saving}
                    className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:border-slate-300 disabled:opacity-50"
                >
                    Annulla modifiche
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={!changedCount || hasErrors || saving}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 disabled:opacity-50"
                >
                    {saving ? 'Salvataggio…' : 'Salva prezzi'}
                </button>
            </div>
        </div>
    );
};
