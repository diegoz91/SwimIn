import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { databaseService, type FeedbackRow } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { ChoiceChips } from '@/components/form/Field';
import { PageLoader } from '@/components/common/PageLoader';
import { Button } from '@/components/ui/Button';
import { formatRelativeTime } from '@/utils/format';

const KIND: Record<FeedbackRow['kind'], { label: string; cls: string }> = {
    problema: { label: 'Qualcosa non va', cls: 'bg-red-50 text-galleggiante-700 border-red-100' },
    idea: { label: 'Idea', cls: 'bg-cloro-50 text-cloro-800 border-cloro-200' },
    altro: { label: 'Altro', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

/** Suggerimenti e segnalazioni arrivati da "Scrivici": da leggere e segnare come gestiti. */
export const AdminFeedback: React.FC<{ onOpenCount?: (n: number) => void }> = ({ onOpenCount }) => {
    const { showToast } = useToast();
    const [status, setStatus] = useState<'open' | 'done'>('open');
    const [rows, setRows] = useState<FeedbackRow[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRows(null);
        try {
            const list = await databaseService.adminListFeedback(status);
            setRows(list);
            if (status === 'open') onOpenCount?.(list.length);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Suggerimenti non caricati.', 'error');
            setRows([]);
        }
    }, [status, onOpenCount, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const toggle = async (row: FeedbackRow) => {
        const next = row.status === 'open' ? 'done' : 'open';
        setBusy(row.$id);
        try {
            await databaseService.adminSetFeedbackStatus(row.$id, next);
            setRows((list) => (list || []).filter((r) => r.$id !== row.$id));
            showToast(next === 'done' ? 'Segnato come gestito.' : 'Riaperto.', 'success', {
                action: { label: 'Annulla', onClick: () => void databaseService.adminSetFeedbackStatus(row.$id, row.status).then(load) },
            });
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-4">
            <ChoiceChips<'open' | 'done'> label="Stato dei suggerimenti" options={[{ value: 'open', label: 'Da leggere' }, { value: 'done', label: 'Gestiti' }]} value={[status]} onChange={(v) => setStatus(v[0] || 'open')} />
            {rows === null ? (
                <PageLoader variant="list" />
            ) : rows.length === 0 ? (
                <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                    {status === 'open' ? 'Nessun messaggio da leggere.' : 'Nessun messaggio gestito.'}
                </p>
            ) : (
                <ul className="space-y-3">
                    {rows.map((r) => (
                        <li key={r.$id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${KIND[r.kind]?.cls || KIND.altro.cls}`}>{KIND[r.kind]?.label || 'Altro'}</span>
                                <Link to={`/profile/${r.userId}`} className="font-semibold text-abisso hover:underline">{r.name}</Link>
                                <span className="text-xs text-slate-500">{formatRelativeTime(r.$createdAt)}</span>
                            </div>
                            <p className="mt-2 text-slate-800 whitespace-pre-line break-words">{r.message}</p>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-slate-500 min-w-0 break-all">{[r.page && `Pagina ${r.page}`, r.userAgent].filter(Boolean).join(' · ')}</p>
                                <Button size="sm" variant={r.status === 'open' ? 'secondary' : 'quiet'} busy={busy === r.$id} onClick={() => void toggle(r)}>
                                    {r.status === 'open' ? 'Segna come gestito' : 'Riapri'}
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
