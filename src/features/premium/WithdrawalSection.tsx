import React, { useCallback, useEffect, useState } from 'react';
import { databaseService, type WithdrawalInfo, type WithdrawalReceipt } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { FormModal } from '@/components/form/FormModal';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/utils/dates';
import { euro } from '@/utils/premium';

const dateTime = (iso: string) => new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'medium' });

const refundText = (r: Pick<WithdrawalReceipt, 'refundStatus' | 'refundAmount'>) =>
    r.refundStatus === 'refunded' ? `Rimborso di ${euro(r.refundAmount)} avviato sul metodo di pagamento usato.`
        : r.refundStatus === 'none' ? 'Nessun importo da rimborsare.'
            : 'Il rimborso della parte non goduta arriva entro 14 giorni sul metodo di pagamento usato.';

/** Ricevuta come file di testo, da conservare (la stessa arriva per email). */
const downloadReceipt = (r: WithdrawalReceipt) => {
    const text = `Ricevuta del recesso da SwimIn Premium\n\n${r.statement}\n\nRecesso ricevuto il ${dateTime(r.requestedAt)}.\n${refundText(r)}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `swimin-recesso-${r.requestedAt.slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Funzione di recesso (Codice del Consumo, art. 54-bis): "Recedi qui dal contratto" visibile per i
 * 14 giorni dalla sottoscrizione, poi la conferma separata "Conferma recesso" e la ricevuta con data e ora.
 */
export const WithdrawalSection: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const { refreshProfile } = useAuth();
    const { showToast } = useToast();
    const [info, setInfo] = useState<WithdrawalInfo | null>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const w = await databaseService.getWithdrawal();
            setInfo({ available: !!w?.available, contract: w?.contract ?? null, receipts: Array.isArray(w?.receipts) ? w.receipts : [] });
        } catch (err) {
            console.warn('Recesso:', err);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    if (!info || (!info.available && info.receipts.length === 0)) return null;
    const c = info.contract;

    const confirmWithdrawal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!c) return;
        setBusy(true);
        try {
            const r = await databaseService.withdrawSubscription(c.id);
            setOpen(false);
            showToast(r.emailed ? 'Recesso inviato: ti abbiamo mandato la ricevuta per email.' : 'Recesso inviato: scarica la ricevuta qui sotto.', 'success');
            await Promise.all([load(), refreshProfile()]);
            onDone();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Recesso non inviato. Riprova.', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section aria-labelledby="withdrawal-title" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 id="withdrawal-title" className="text-xl font-bold text-abisso">Recesso</h2>
            {c && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm text-slate-600 max-w-xl">
                        Puoi recedere dall’abbonamento entro il {formatDate(c.deadline.slice(0, 10), 'long')}: Premium si chiude subito e ti rimborsiamo la parte non goduta.
                    </p>
                    <Button variant="secondary" onClick={() => setOpen(true)}>Recedi qui dal contratto</Button>
                </div>
            )}
            {info.receipts.length > 0 && (
                <ul className="mt-4 space-y-3">
                    {info.receipts.map((r) => (
                        <li key={r.id} className="rounded-xl bg-piastrella border border-slate-200 p-4 text-sm">
                            <p className="font-semibold text-abisso">Recesso ricevuto il {dateTime(r.requestedAt)}</p>
                            <p className="text-slate-600 mt-1">{r.statement}</p>
                            <p className="text-slate-600 mt-1">{refundText(r)}</p>
                            <button type="button" onClick={() => downloadReceipt(r)} className="mt-2 py-1 -my-1 font-semibold text-corsia-700 hover:underline">Scarica la ricevuta</button>
                        </li>
                    ))}
                </ul>
            )}
            {c && (
                <FormModal
                    open={open}
                    title="Recedi dal contratto"
                    description="Controlla il contratto e conferma: il recesso vale da quando premi «Conferma recesso»."
                    icon="alert-triangle"
                    tone="danger"
                    busy={busy}
                    busyLabel="Invio del recesso…"
                    submitLabel="Conferma recesso"
                    cancelLabel="Annulla"
                    onClose={() => setOpen(false)}
                    onSubmit={confirmWithdrawal}
                >
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                        <dt className="text-slate-500">Contratto</dt>
                        <dd className="font-semibold text-abisso">SwimIn Premium {c.period === 'year' ? 'annuale' : 'mensile'}</dd>
                        <dt className="text-slate-500">Sottoscritto il</dt>
                        <dd className="text-abisso">{dateTime(c.startedAt)}</dd>
                        <dt className="text-slate-500">Pagamento</dt>
                        <dd className="text-abisso">{c.provider === 'stripe' ? 'Carta' : 'PayPal'}</dd>
                    </dl>
                    <p className="mt-4 text-sm text-slate-600">
                        Premium si chiude subito, l’abbonamento non si rinnova e ricevi il rimborso della parte di periodo non goduta. Ti mandiamo la ricevuta con data e ora del recesso.
                    </p>
                </FormModal>
            )}
        </section>
    );
};
