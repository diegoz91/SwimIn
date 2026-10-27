import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { databaseService, type AuditRow } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { ChoiceChips } from '@/components/form/Field';
import { Select } from '@/components/form/Pickers';
import { PageLoader } from '@/components/common/PageLoader';
import { Button } from '@/components/ui/Button';
import { formatRelativeTime } from '@/utils/format';

/** Nomi comprensibili delle azioni registrate; le altre si mostrano col nome tecnico. */
export const AUDIT_LABELS: Record<string, string> = {
    adminListAudit: 'Ha consultato il registro accessi',
    adminListReports: 'Ha consultato le segnalazioni',
    adminResolveReport: 'Ha deciso una segnalazione',
    adminSearchUsers: 'Ha cercato utenti',
    adminSetSuspended: 'Ha sospeso o riattivato un account',
    adminGrantPremium: 'Ha regalato Premium',
    adminUpdatePlans: 'Ha cambiato piani e prezzi',
    adminListErrors: 'Ha consultato gli errori',
    adminSetAppStatus: 'Ha cambiato lo stato del servizio',
    adminListFeedback: 'Ha letto i suggerimenti',
    adminSetFeedbackStatus: 'Ha gestito un suggerimento',
    adminListPendingCerts: 'Ha consultato i brevetti da verificare',
    adminGetCertDocument: 'Ha aperto il documento di un brevetto',
    adminVerifyCert: 'Ha verificato un brevetto',
    legalCreateHold: 'Ha registrato un ordine di conservazione',
    legalListHolds: 'Ha consultato le richieste delle autorità',
    legalExtendHold: 'Ha prorogato una conservazione',
    legalReleaseHold: 'Ha chiuso una conservazione',
    legalExportHold: 'Ha esportato una conservazione',
};

const OUTCOME: Record<AuditRow['outcome'], { label: string; cls: string }> = {
    ok: { label: 'Riuscita', cls: 'bg-cloro-50 text-cloro-800 border-cloro-200' },
    denied: { label: 'Negata', cls: 'bg-red-50 text-galleggiante-700 border-red-100' },
    error: { label: 'Errore', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

/** Parametri registrati come testo leggibile ("query: rossi"). */
const metaText = (meta: string) => {
    if (!meta) return '';
    try {
        return Object.entries(JSON.parse(meta) as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(', ');
    } catch {
        return meta;
    }
};

const TARGET: Record<string, string> = { user: 'utente', profile: 'profilo', report: 'segnalazione', hold: 'conservazione', application: 'candidatura', feedback: 'suggerimento', cert: 'brevetto', job: 'annuncio', subject: 'oggetto' };

/**
 * Registro degli accessi dello staff: chi ha fatto cosa nel pannello amministratori, anche i
 * tentativi negati. Solo lettura, nessun contenuto (testi, messaggi), conservato 12 mesi.
 */
export const AdminAudit: React.FC = () => {
    const { showToast } = useToast();
    const [rows, setRows] = useState<AuditRow[] | null>(null);
    const [action, setAction] = useState('');
    const [only, setOnly] = useState<'all' | 'denied'>('all');

    const load = useCallback(async () => {
        setRows(null);
        try {
            setRows(await databaseService.adminListAudit(action ? { action } : {}));
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Registro non caricato.', 'error');
            setRows([]);
        }
    }, [action, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const options = useMemo(() => Object.entries(AUDIT_LABELS).map(([value, label]) => ({ value, label })), []);
    const visible = (rows || []).filter((r) => only === 'all' || r.outcome !== 'ok');

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600 max-w-2xl">
                Ogni azione del pannello amministratori e delle richieste delle autorità viene registrata in automatico, anche i tentativi negati. Il registro non si può modificare e non contiene i contenuti consultati.
            </p>
            <div className="flex flex-wrap items-center gap-3">
                <div className="w-full sm:w-72">
                    <Select size="sm" label="Azione" value={action} onChange={setAction} placeholder="Tutte le azioni" clearLabel="Tutte le azioni" options={options} searchable />
                </div>
                <ChoiceChips<'all' | 'denied'> label="Esito" options={[{ value: 'all', label: 'Tutte' }, { value: 'denied', label: 'Negate o con errore' }]} value={[only]} onChange={(v) => setOnly(v[0] || 'all')} />
                <Button size="sm" variant="quiet" onClick={() => void load()}>Aggiorna</Button>
            </div>
            {rows === null ? (
                <PageLoader variant="list" />
            ) : visible.length === 0 ? (
                <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Nessuna voce nel registro.</p>
            ) : (
                <ul className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                    {visible.map((r) => (
                        <li key={r.id} className="px-4 py-3 sm:px-5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <Link to={`/profile/${r.actorId}`} className="font-semibold text-abisso hover:underline py-1 -my-1">{r.actorName}</Link>
                                <span className="text-slate-700 min-w-0">{AUDIT_LABELS[r.action] || r.action}</span>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${OUTCOME[r.outcome]?.cls || OUTCOME.error.cls}`}>{OUTCOME[r.outcome]?.label || r.outcome}</span>
                                {r.scope === 'legal' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-abisso text-white border-abisso">Autorità</span>}
                                <time dateTime={r.at} className="text-xs text-slate-500 ml-auto">{formatRelativeTime(r.at)}</time>
                            </div>
                            {(r.targetId || r.reason || r.meta) && (
                                <p className="mt-1 text-xs text-slate-500 break-all">
                                    {[r.targetId && `${TARGET[r.targetType] || r.targetType || 'elemento'} ${r.targetId}`, r.reason && `motivo: ${r.reason}`, metaText(r.meta)].filter(Boolean).join(' · ')}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
