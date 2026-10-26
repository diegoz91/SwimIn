import React, { useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { Select } from '@/components/form/Pickers';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { databaseService, type TeamMember } from '@/services/database';
import { formatDate } from '@/utils/dates';
import type { SquadShift } from '@/types/types';

const ANYONE = '__staff__';

/**
 * Chi ha un turno chiede a un collega di coprirlo, oppure lo offre a tutto lo staff:
 * il primo che accetta lo prende (già confermato) e la struttura viene avvisata.
 */
export const ShiftSwapModal: React.FC<{ shift: (SquadShift & { structureName?: string }) | null; colleagues?: TeamMember[]; currentUserId: string; onClose: () => void; onSent: () => void }> = ({ shift, colleagues, currentUserId, onClose, onSent }) => {
    const { showToast } = useToast();
    const [people, setPeople] = useState<TeamMember[]>([]);
    const [to, setTo] = useState(ANYONE);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!shift) return;
        setTo(ANYONE);
        setMessage('');
        if (colleagues) { setPeople(colleagues.filter((c) => c.userId !== currentUserId)); return; }
        // Da "I miei turni": i colleghi si leggono dalla bacheca della struttura.
        databaseService.getTeamBoard(shift.structureId).then((b) => setPeople(b.members.filter((m) => m.userId !== currentUserId))).catch((err) => console.warn('Colleghi:', err));
    }, [shift, colleagues, currentUserId]);

    if (!shift) return null;
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            await databaseService.proposeShiftSwap(shift.$id, to === ANYONE ? null : to, message.trim());
            showToast(to === ANYONE ? 'Richiesta inviata a tutto lo staff: il primo che accetta prende il turno.' : 'Richiesta inviata: ti avvisiamo appena risponde.', 'success');
            onSent();
            onClose();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Richiesta non inviata.', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <FormModal
            open
            title="Cedi o scambia il turno"
            icon="arrow-path"
            description={`${formatDate(shift.date, 'weekday')}, ${shift.shiftTime}${shift.structureName ? ` · ${shift.structureName}` : ''}`}
            submitLabel="Invia la richiesta"
            busy={busy}
            dirty={!!message.trim()}
            onClose={onClose}
            onSubmit={submit}
        >
            <Field id="swap-to" label="A chi lo chiedi">
                <Select
                    label="A chi lo chiedi"
                    value={to}
                    onChange={setTo}
                    options={[{ value: ANYONE, label: 'A tutto lo staff', hint: 'Il primo che accetta lo prende' }, ...people.map((p) => ({ value: p.userId, label: `${p.firstName} ${p.lastName}`.trim() || 'Collega', hint: p.title }))]}
                />
            </Field>
            <Field id="swap-msg" label="Messaggio" optional hint="Ad esempio il motivo o cosa offri in cambio.">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={300} placeholder="Es. Ho una visita medica, ti copro io venerdì." className={fieldClass(undefined, 'resize-y')} />
            </Field>
            <p className="text-sm text-slate-600 bg-piastrella rounded-xl px-4 py-3">Il turno resta tuo finché qualcuno non accetta. Puoi annullare la richiesta quando vuoi.</p>
        </FormModal>
    );
};

export interface SwapItem {
    id: string;
    kind: 'incoming' | 'open' | 'mine';
    title: string;
    detail: string;
    message?: string;
}

/** Richieste di cambio turno: da accettare (per me o aperte a tutti) e mie in attesa. */
export const SwapRequests: React.FC<{ items: SwapItem[]; onChanged: () => void }> = ({ items, onChanged }) => {
    const { showToast } = useToast();
    const [busy, setBusy] = useState<string | null>(null);
    if (!items.length) return null;

    const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
        setBusy(id);
        try {
            await fn();
            showToast(ok, 'success');
            onChanged();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
            onChanged();
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="mb-5 rounded-2xl border border-corsia-200 bg-corsia-50/50 p-4" aria-labelledby="swaps-title">
            <h3 id="swaps-title" className="font-semibold text-abisso flex items-center gap-2"><Icon type="arrow-path" className="w-4 h-4 text-corsia-700" /> Cambi turno</h3>
            <ul className="mt-3 space-y-2">
                {items.map((w) => (
                    <li key={w.id} className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-abisso">{w.title}</p>
                            <p className="text-sm text-slate-600">{w.detail}</p>
                            {w.message && <p className="text-sm text-slate-500 italic mt-0.5 break-words">«{w.message}»</p>}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                            {w.kind === 'mine' ? (
                                <button type="button" disabled={busy === w.id} onClick={() => act(w.id, () => databaseService.cancelShiftSwap(w.id), 'Richiesta annullata.')} className="px-3.5 py-1.5 rounded-full text-sm font-semibold border border-slate-300 text-abisso hover:bg-slate-50 disabled:opacity-60">Annulla</button>
                            ) : (
                                <>
                                    <button type="button" disabled={busy === w.id} onClick={() => act(w.id, () => databaseService.respondShiftSwap(w.id, true), 'Turno preso: è nel tuo calendario, già confermato.')} className="px-3.5 py-1.5 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60">
                                        {w.kind === 'open' ? 'Lo prendo' : 'Accetto'}
                                    </button>
                                    {w.kind === 'incoming' && (
                                        <button type="button" disabled={busy === w.id} onClick={() => act(w.id, () => databaseService.respondShiftSwap(w.id, false), 'Risposta inviata.')} className="px-3.5 py-1.5 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60">Non posso</button>
                                    )}
                                </>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
};
