import React, { useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { databaseService, type ShiftTemplate, type TeamMember, type TemplateSlot } from '@/services/database';
import { addDaysISO, formatWeek } from '@/utils/dates';
import type { SquadShift } from '@/types/types';

const DAY_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const weekdayOf = (iso: string) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;

const summary = (t: ShiftTemplate) => {
    const days = [...new Set(t.slots.map((s) => s.weekday))].sort().map((d) => DAY_SHORT[d]).join(', ');
    return `${t.slots.length === 1 ? '1 turno' : `${t.slots.length} turni`} · ${days}`;
};

/**
 * Modelli di settimana: si salva una settimana ben organizzata e la si riapplica alle
 * settimane successive con un tocco (senza doppioni; ognuno riceve un solo avviso).
 */
export const ShiftTemplatesModal: React.FC<{
    open: boolean;
    structureId: string;
    weekStart: string;
    weekShifts: SquadShift[];
    staff: TeamMember[];
    onClose: () => void;
    onApplied: (created: SquadShift[]) => void;
}> = ({ open, structureId, weekStart, weekShifts, staff, onClose, onApplied }) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [templates, setTemplates] = useState<ShiftTemplate[] | null>(null);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setTemplates(null);
        setName('');
        databaseService.listShiftTemplates(structureId).then(setTemplates).catch((err) => { showToast(err instanceof Error ? err.message : 'Modelli non disponibili.', 'error'); setTemplates([]); });
    }, [open, structureId]); // eslint-disable-line react-hooks/exhaustive-deps

    const nameOf = (id: string) => { const s = staff.find((x) => x.userId === id); return s ? `${s.firstName} ${s.lastName}`.trim() : 'Ex membro'; };
    const usable = weekShifts.filter((s) => s.status !== 'declined' && staff.some((m) => m.userId === s.userId));

    const saveWeek = async () => {
        const title = name.trim();
        if (title.length < 2) return showToast('Dai un nome al modello, es. "Settimana estiva".', 'error');
        const slots: TemplateSlot[] = usable.map((s) => ({ weekday: weekdayOf(s.date), shiftTime: s.shiftTime, userId: s.userId, role: s.role }));
        setBusy('save');
        try {
            const t = await databaseService.saveShiftTemplate({ structureId, name: title, slots });
            setTemplates((list) => [t, ...(list || [])]);
            setName('');
            showToast('Modello salvato: applicalo alle prossime settimane.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Modello non salvato.', 'error');
        } finally {
            setBusy(null);
        }
    };

    const apply = async (t: ShiftTemplate) => {
        setBusy(t.$id);
        try {
            const res = await databaseService.applyShiftTemplate(t.$id, weekStart);
            onApplied(res.created);
            showToast(
                res.created.length === 0
                    ? 'Nessun turno nuovo: la settimana li ha già tutti.'
                    : `${res.created.length} turni creati${res.skipped ? ` (${res.skipped} già presenti o non più assegnabili)` : ''}.`,
                res.created.length ? 'success' : 'info'
            );
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Modello non applicato.', 'error');
        } finally {
            setBusy(null);
        }
    };

    const remove = async (t: ShiftTemplate) => {
        if (!(await confirm({ title: `Eliminare «${t.name}»?`, message: 'I turni già creati restano.', confirmLabel: 'Elimina', tone: 'danger' }))) return;
        try {
            await databaseService.deleteShiftTemplate(t.$id);
            setTemplates((list) => (list || []).filter((x) => x.$id !== t.$id));
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
        }
    };

    return (
        <FormModal open={open} title="Modelli di settimana" icon="calendar" size="lg" submitLabel="Fatto" cancelLabel={null} onClose={onClose} onSubmit={(e) => { e.preventDefault(); onClose(); }}>
            <section aria-labelledby="tpl-apply">
                <h3 id="tpl-apply" className="text-sm font-semibold text-abisso mb-2">Applica alla settimana {formatWeek(weekStart)}</h3>
                {templates === null ? (
                    <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
                ) : templates.length === 0 ? (
                    <p className="text-sm text-slate-500">Nessun modello ancora: organizza una settimana e salvala qui sotto.</p>
                ) : (
                    <ul className="space-y-2">
                        {templates.map((t) => (
                            <li key={t.$id} className="rounded-2xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-abisso">{t.name}</p>
                                    <p className="text-sm text-slate-500">{summary(t)}</p>
                                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{[...new Set(t.slots.map((s) => nameOf(s.userId)))].join(', ')}</p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button type="button" onClick={() => apply(t)} disabled={!!busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-corsia-600 text-white text-sm font-semibold hover:bg-corsia-700 disabled:opacity-60">
                                        {busy === t.$id ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" /> : <Icon type="check" className="w-4 h-4" />}
                                        Applica
                                    </button>
                                    <button type="button" onClick={() => remove(t)} disabled={!!busy} aria-label={`Elimina il modello ${t.name}`} className="p-2 rounded-full text-slate-500 hover:text-galleggiante-700 hover:bg-red-50">
                                        <Icon type="trash" className="w-4 h-4" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section aria-labelledby="tpl-save" className="pt-4 border-t border-slate-100">
                <h3 id="tpl-save" className="text-sm font-semibold text-abisso">Salva questa settimana come modello</h3>
                <p className="text-sm text-slate-500 mt-0.5 mb-3">
                    {usable.length === 0 ? `Nella settimana ${formatWeek(weekStart)} non ci sono turni da salvare.` : `${usable.length} turni dal ${addDaysISO(weekStart, 0).slice(8, 10)} al ${addDaysISO(weekStart, 6).slice(8, 10)}: giorni, orari e persone.`}
                </p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <Field id="tpl-name" label="Nome del modello" className="flex-1">
                        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveWeek(); } }} maxLength={60} placeholder="Es. Settimana estiva" className={fieldClass()} />
                    </Field>
                    <button type="button" onClick={saveWeek} disabled={!usable.length || !!busy} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-slate-300 text-abisso text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
                        {busy === 'save' ? <span className="w-4 h-4 border-2 border-slate-300 border-t-corsia-600 rounded-full animate-spin" aria-hidden="true" /> : <Icon type="plus" className="w-4 h-4" />}
                        Salva modello
                    </button>
                </div>
            </section>
        </FormModal>
    );
};
