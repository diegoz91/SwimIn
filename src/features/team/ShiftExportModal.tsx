import React, { useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { MonthYearPicker } from '@/components/form/Pickers';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { currentMonth, formatMonth } from '@/utils/dates';
import { buildShiftsCsv, downloadText, shiftTotals } from '@/utils/shiftExport';

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'struttura';

/** Turni di un mese in un file CSV (Excel, Numbers, Fogli) con le ore per persona: per le paghe. */
export const ShiftExportModal: React.FC<{ open: boolean; structureId: string; defaultMonth?: string; onClose: () => void }> = ({ open, structureId, defaultMonth, onClose }) => {
    const { showToast } = useToast();
    const [month, setMonth] = useState(defaultMonth || currentMonth());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setMonth(defaultMonth || currentMonth());
            setError(null);
        }
    }, [open, defaultMonth]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!/^\d{4}-\d{2}$/.test(month)) return setError('Scegli il mese.');
        setBusy(true);
        setError(null);
        try {
            const data = await databaseService.exportShifts(structureId, month);
            if (!data.shifts.length) return setError(`Nessun turno a ${formatMonth(month)}.`);
            downloadText(`turni-${slug(data.structureName)}-${month}.csv`, buildShiftsCsv(data.shifts, data));
            const totals = shiftTotals(data.shifts);
            const hours = totals.reduce((n, t) => n + t.hours, 0);
            showToast(`File scaricato: ${data.shifts.length} turni, ${hours.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ore per ${totals.length === 1 ? '1 persona' : `${totals.length} persone`}.`, 'success');
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Esportazione non riuscita.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <FormModal open={open} title="Esporta i turni del mese" description="Un file per le paghe: ogni turno con orario e ore, poi il totale per persona." icon="calendar" submitLabel="Scarica il file" busyLabel="Preparazione…" busy={busy} onClose={onClose} onSubmit={submit}>
            <div className="max-w-xs">
                <p className="text-sm font-semibold text-abisso mb-1.5">Mese</p>
                <MonthYearPicker label="Mese da esportare" value={month} onChange={(v) => { setMonth(v); setError(null); }} minYear={new Date().getFullYear() - 2} maxYear={new Date().getFullYear() + 1} />
            </div>
            {error && <p role="alert" className="text-sm font-medium text-galleggiante-700">{error}</p>}
            <p className="text-xs text-slate-500">Formato CSV: si apre con Excel, Numbers o Google Fogli. I turni che la persona non può coprire restano nell’elenco ma non contano nelle ore.</p>
        </FormModal>
    );
};
