import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { FormModal } from '@/components/form/FormModal';
import { useToast } from '@/context/ToastContext';
import { databaseService, type Recommendation } from '@/services/database';
import { initialsAvatar } from '@/utils/avatar';
import { formatDate } from '@/utils/dates';
import { relationLabel } from './labels';

type Action = 'publish' | 'hide' | 'delete';

/**
 * Revisione delle referenze ricevute, una alla volta: pubblicarla sul profilo, non pubblicarla
 * (resta tra le "non pubblicate" e si può pubblicare dopo) o eliminarla.
 */
export const RecommendationReviewModal: React.FC<{
    open: boolean;
    queue: Recommendation[];
    startId?: string | null;
    onDone: (changed: boolean) => void;
}> = ({ open, queue, startId, onDone }) => {
    const { showToast } = useToast();
    const [list, setList] = useState<Recommendation[]>([]);
    const [index, setIndex] = useState(0);
    const [busy, setBusy] = useState<Action | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [results, setResults] = useState({ published: 0, hidden: 0, deleted: 0 });

    // La coda si fissa all'apertura: le azioni non la fanno "saltare" mentre la si scorre.
    useEffect(() => {
        if (!open) return;
        setList(queue);
        setIndex(Math.max(0, startId ? queue.findIndex((r) => r.$id === startId) : 0));
        setResults({ published: 0, hidden: 0, deleted: 0 });
        setConfirmDelete(false);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const current = list[index];

    const finish = (r: typeof results) => {
        const parts = [
            r.published && `${r.published} ${r.published === 1 ? 'pubblicata' : 'pubblicate'}`,
            r.hidden && `${r.hidden} non ${r.hidden === 1 ? 'pubblicata' : 'pubblicate'}`,
            r.deleted && `${r.deleted} ${r.deleted === 1 ? 'eliminata' : 'eliminate'}`,
        ].filter(Boolean);
        if (parts.length) showToast(`Referenze: ${parts.join(', ')}.`, 'success');
        onDone(parts.length > 0);
    };

    const act = async (action: Action) => {
        if (!current) return;
        setBusy(action);
        try {
            await databaseService.respondRecommendation(current.$id, action);
            const next = { ...results, [action === 'publish' ? 'published' : action === 'hide' ? 'hidden' : 'deleted']: results[action === 'publish' ? 'published' : action === 'hide' ? 'hidden' : 'deleted'] + 1 };
            setResults(next);
            setConfirmDelete(false);
            if (index + 1 < list.length) setIndex(index + 1);
            else finish(next);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita. Riprova.', 'error');
        } finally {
            setBusy(null);
        }
    };

    if (!current) return null;
    const a = current.author;

    return (
        <FormModal
            open={open}
            title={`Referenza da ${a.name}`}
            description={list.length > 1 ? `${index + 1} di ${list.length} · la vedi solo tu finché non la pubblichi` : 'La vedi solo tu finché non la pubblichi.'}
            icon="star"
            size="lg"
            busy={busy !== null}
            busyLabel={busy === 'publish' ? 'Pubblicazione…' : 'Attendi…'}
            submitLabel="Pubblica sul profilo"
            cancelLabel={null}
            onClose={() => finish(results)}
            onSubmit={(e) => { e.preventDefault(); void act('publish'); }}
            secondaryAction={
                <button type="button" onClick={() => act('hide')} disabled={busy !== null} className="px-4 py-2.5 rounded-full font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50">
                    Non pubblicare
                </button>
            }
        >
            <div className="flex items-start gap-3">
                <img src={a.avatar || initialsAvatar(a.name)} alt="" className="w-12 h-12 rounded-full object-cover bg-slate-100 shrink-0" />
                <div className="min-w-0">
                    <Link to={`/profile/${current.authorId}`} onClick={() => finish(results)} className="font-semibold text-abisso hover:underline">{a.name}</Link>
                    <p className="text-sm text-slate-500">{[a.headline, relationLabel(current.relationship), formatDate(current.$createdAt.slice(0, 10), 'short')].filter(Boolean).join(' · ')}</p>
                </div>
            </div>
            <blockquote className="rounded-2xl bg-piastrella border border-slate-100 p-4 sm:p-5 text-abisso leading-relaxed whitespace-pre-line break-words">
                {current.content}
            </blockquote>
            <div className="text-sm text-slate-600 space-y-1">
                <p><strong className="text-abisso">Pubblica sul profilo</strong>: la vede chiunque visiti il tuo profilo, firmata da {a.name}.</p>
                <p><strong className="text-abisso">Non pubblicare</strong>: resta privata tra le referenze non pubblicate; puoi pubblicarla quando vuoi.</p>
            </div>
            {confirmDelete ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex flex-wrap items-center gap-3" role="alert">
                    <p className="text-sm text-red-800 flex-1 min-w-[12rem]">Eliminarla per sempre? {a.name} non lo saprà, ma potrà scriverne un’altra.</p>
                    <button type="button" onClick={() => act('delete')} disabled={busy !== null} className="px-3.5 py-1.5 rounded-full text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Elimina</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="px-3.5 py-1.5 rounded-full text-sm font-semibold text-slate-700 hover:bg-white">Annulla</button>
                </div>
            ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="py-1 -my-1 text-sm font-semibold text-galleggiante-700 hover:underline">Elimina questa referenza</button>
            )}
        </FormModal>
    );
};
