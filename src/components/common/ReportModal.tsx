import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { databaseService, type ReportReason, type ReportTarget } from '@/services/database';

const REASONS: { id: ReportReason; label: string; hint: string }[] = [
    { id: 'spam', label: 'Spam o pubblicità', hint: 'Contenuti ripetitivi, promozioni non richieste' },
    { id: 'molestie', label: 'Molestie o bullismo', hint: 'Insulti, minacce, attacchi personali' },
    { id: 'contenuto_inappropriato', label: 'Contenuto inappropriato', hint: 'Violento, discriminatorio, sessualmente esplicito, minori' },
    { id: 'falso_profilo', label: 'Profilo falso', hint: 'Si spaccia per qualcun altro o per una struttura' },
    { id: 'offerta_ingannevole', label: 'Offerta di lavoro ingannevole', hint: 'Annuncio falso, richieste di denaro' },
    { id: 'altro', label: 'Altro', hint: 'Descrivi il problema qui sotto' },
];

const TARGET_LABEL: Record<ReportTarget, string> = {
    post: 'il post',
    comment: 'il commento',
    profile: 'il profilo',
    job: "l'annuncio",
    facility: 'la pagina',
    review: 'la recensione',
};

interface ReportModalProps {
    targetType: ReportTarget;
    targetId: string;
    onClose: () => void;
}

/** Segnalazione di un contenuto ai moderatori (salvata lato server, visibile solo dalla Console). */
export const ReportModal: React.FC<ReportModalProps> = ({ targetType, targetId, onClose }) => {
    const { showToast } = useToast();
    const [reason, setReason] = useState<ReportReason | null>(null);
    const [details, setDetails] = useState('');
    const [isSending, setIsSending] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason) return;
        setIsSending(true);
        try {
            await databaseService.reportContent({ targetType, targetId, reason, details: details.trim() });
            showToast('Grazie, la segnalazione è stata inviata. La esamineremo al più presto.', 'success');
            onClose();
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Invio non riuscito.', 'error');
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-abisso/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <form
                onSubmit={submit}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
                aria-labelledby="report-title"
            >
                <div className="flex justify-between items-center p-5 border-b border-slate-100">
                    <h2 id="report-title" className="text-lg font-extrabold text-slate-900">Segnala {TARGET_LABEL[targetType]}</h2>
                    <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-full" aria-label="Chiudi">
                        <Icon type="x" className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-5 overflow-y-auto space-y-2">
                    <p className="text-sm text-slate-600 mb-3">Perché lo stai segnalando? La segnalazione è anonima per l'autore.</p>
                    {REASONS.map((r) => (
                        <label
                            key={r.id}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${reason === r.id ? 'border-corsia-400 bg-corsia-50' : 'border-slate-200 hover:bg-slate-50'}`}
                        >
                            <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="peer sr-only" />
                            <span aria-hidden="true" className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded-full border-2 grid place-items-center transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-corsia-100 ${reason === r.id ? 'border-corsia-600' : 'border-slate-300'}`}>
                                <span className={`w-2.5 h-2.5 rounded-full bg-corsia-600 transition-transform duration-150 ${reason === r.id ? 'scale-100' : 'scale-0'}`} />
                            </span>
                            <span>
                                <span className="block text-sm font-bold text-slate-800">{r.label}</span>
                                <span className="block text-xs text-slate-500">{r.hint}</span>
                            </span>
                        </label>
                    ))}
                    <label htmlFor="report-details" className="block text-sm font-semibold text-slate-700 pt-2">Dettagli (facoltativo)</label>
                    <textarea
                        id="report-details"
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        maxLength={1000}
                        rows={3}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="p-4 border-t border-slate-100 flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-2.5 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">Annulla</button>
                    <button type="submit" disabled={!reason || isSending} className="flex-1 py-2.5 font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50">
                        {isSending ? 'Invio…' : 'Invia segnalazione'}
                    </button>
                </div>
            </form>
        </div>
    );
};
