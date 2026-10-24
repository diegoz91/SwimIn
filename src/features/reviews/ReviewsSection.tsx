import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Review, UserProfile } from '@/types/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { FormModal } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { MonthYearPicker } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { check, maxLength, minLength, required } from '@/utils/validation';
import { avatarOf, displayNameOf } from '@/utils/profile';
import { formatMonth } from '@/utils/dates';
import { formatRelativeTime } from '@/utils/format';
import { Icon } from '@/components/ui/Icon';
import { Stars, StarInput } from './Stars';
import { useBlocks } from '@/context/BlocksContext';

type Values = { rating: number; content: string; visitedAt: string };
const MAX = 2000;

const validate = (v: Values): FormErrors<Values> => ({
    rating: v.rating >= 1 && v.rating <= 5 ? undefined : 'Scegli un voto da 1 a 5 stelle.',
    content: check(v.content, required('Racconta la tua esperienza.'), minLength(20, 'Scrivi almeno 20 caratteri: cosa ti è piaciuto e cosa no.'), maxLength(MAX)),
});

const ReviewModal: React.FC<{ open: boolean; structureName: string; existing?: Review; onClose: () => void; onSubmit: (v: Values) => Promise<void>; onDelete?: () => Promise<void> }> = ({
    open, structureName, existing, onClose, onSubmit, onDelete,
}) => {
    const [saving, setSaving] = useState(false);
    const form = useForm<Values>({ rating: 0, content: '', visitedAt: '' }, useCallback(validate, []));
    useEffect(() => {
        if (open) form.reset({ rating: existing?.rating || 0, content: existing?.content || '', visitedAt: existing?.visitedAt || '' });
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        try {
            await onSubmit(v);
            onClose();
        } finally {
            setSaving(false);
        }
    });

    return (
        <FormModal
            open={open}
            title={existing ? 'Modifica la recensione' : 'Scrivi una recensione'}
            description={structureName}
            icon="star"
            dirty={form.isDirty}
            busy={saving}
            submitLabel={existing ? 'Salva' : 'Pubblica'}
            busyLabel="Pubblicazione…"
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
            secondaryAction={
                existing && onDelete ? (
                    <button type="button" className="text-sm font-semibold text-galleggiante hover:underline" onClick={async () => { if (window.confirm('Eliminare la tua recensione?')) { await onDelete(); onClose(); } }}>
                        Elimina
                    </button>
                ) : null
            }
        >
            <Field id="rev-rating" label="Il tuo voto" error={form.errors.rating}>
                <StarInput value={form.values.rating} onChange={(v) => { form.set('rating', v); form.touch('rating'); }} invalid={!!form.errors.rating} />
            </Field>
            <Field id="rev-content" label="La tua esperienza" error={form.errors.content} count={{ value: form.values.content, max: MAX }} hint="Pulizia, acqua, spogliatoi, corsi, personale. Le recensioni sono pubbliche e firmate con il tuo nome.">
                <textarea {...form.bind('content')} rows={6} className={fieldClass(form.errors.content, 'resize-y min-h-[8rem]')} />
            </Field>
            <Field id="rev-visit" label="Quando ci sei stato" optional>
                <MonthYearPicker label="Quando ci sei stato" value={form.values.visitedAt} onChange={(v) => form.set('visitedAt', v)} />
            </Field>
        </FormModal>
    );
};

/**
 * Recensioni di una struttura: media, distribuzione dei voti, elenco con risposta
 * della struttura. Chi gestisce la struttura può rispondere, non recensire.
 */
export const ReviewsSection: React.FC<{
    structureId: string;
    structureName: string;
    /** L'utente corrente gestisce la struttura. */
    isManager: boolean;
    initial?: { ratingSum?: number; ratingCount?: number };
}> = ({ structureId, structureName, isManager, initial }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [reviews, setReviews] = useState<Review[] | null>(null);
    const blocks = useBlocks();
    const [authors, setAuthors] = useState<Record<string, UserProfile>>({});
    const [open, setOpen] = useState(false);
    const [replying, setReplying] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [stats, setStats] = useState({ sum: initial?.ratingSum || 0, count: initial?.ratingCount || 0 });

    const load = useCallback(async () => {
        try {
            const list = await databaseService.getReviews(structureId);
            setReviews(list);
            const ids = [...new Set(list.map((r) => r.authorId))];
            if (ids.length) {
                const profiles = (await databaseService.getConnectionsProfiles(ids)) as UserProfile[];
                setAuthors(Object.fromEntries(profiles.map((p) => [p.userId || p.$id, p])));
            }
        } catch (e) {
            console.warn('Recensioni non disponibili:', e);
            setReviews([]);
        }
    }, [structureId]);

    useEffect(() => {
        load();
    }, [load]);

    const mine = reviews?.find((r) => r.authorId === user?.$id);
    const canReview = !!user && user.userType === 'professional' && !isManager;
    const average = stats.count ? stats.sum / stats.count : 0;
    const distribution = useMemo(() => [5, 4, 3, 2, 1].map((n) => ({ n, count: (reviews || []).filter((r) => r.rating === n).length })), [reviews]);

    const submit = async (v: Values) => {
        try {
            const res = await databaseService.upsertReview({ structureId, rating: v.rating, content: v.content.trim(), visitedAt: v.visitedAt });
            setStats({ sum: res.ratingSum, count: res.ratingCount });
            showToast(mine ? 'Recensione aggiornata.' : 'Grazie! La recensione è pubblicata.', 'success');
            await load();
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Recensione non salvata.', 'error');
            throw error;
        }
    };

    const remove = async () => {
        if (!mine) return;
        try {
            const res = await databaseService.deleteReview(mine.$id);
            setStats({ sum: res.ratingSum, count: res.ratingCount });
            showToast('Recensione eliminata.', 'info');
            await load();
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Eliminazione non riuscita.', 'error');
        }
    };

    const sendReply = async (reviewId: string) => {
        if (replyText.trim().length > 1000) return showToast('La risposta può avere al massimo 1000 caratteri.', 'error');
        try {
            const updated = await databaseService.replyReview(reviewId, replyText.trim());
            setReviews((prev) => (prev || []).map((r) => (r.$id === reviewId ? updated : r)));
            setReplying(null);
            showToast(replyText.trim() ? 'Risposta pubblicata.' : 'Risposta rimossa.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Risposta non salvata.', 'error');
        }
    };

    return (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6" aria-labelledby="reviews-title">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div>
                    <h2 id="reviews-title" className="text-2xl font-bold text-abisso">Recensioni</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Esperienze di chi nuota o lavora qui.</p>
                </div>
                {canReview && (
                    <button onClick={() => setOpen(true)} className="px-4 py-2.5 rounded-full bg-corsia-600 hover:bg-corsia-700 text-white font-semibold inline-flex items-center gap-2">
                        <Icon type={mine ? 'edit' : 'star'} className="w-4 h-4" /> {mine ? 'Modifica la tua recensione' : 'Scrivi una recensione'}
                    </button>
                )}
            </div>

            {stats.count > 0 && (
                <div className="grid sm:grid-cols-[auto_1fr] gap-6 items-center mb-6 p-5 rounded-2xl bg-piastrella">
                    <div className="text-center sm:pr-6 sm:border-r border-slate-200">
                        <p className="font-display text-5xl font-bold text-abisso leading-none">{average.toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</p>
                        <Stars value={average} size="md" className="mt-2" />
                        <p className="text-xs text-slate-500 mt-1">{stats.count === 1 ? '1 recensione' : `${stats.count} recensioni`}</p>
                    </div>
                    <ul className="space-y-1.5" aria-label="Distribuzione dei voti">
                        {distribution.map((d) => (
                            <li key={d.n} className="flex items-center gap-2 text-xs">
                                <span className="w-14 text-slate-600 tabular-nums">{d.n} {d.n === 1 ? 'stella' : 'stelle'}</span>
                                <span className="flex-1 h-2 rounded-full bg-white overflow-hidden">
                                    <span className="block h-full rounded-full bg-amber-400 transition-[width] duration-700" style={{ width: `${reviews?.length ? (d.count / reviews.length) * 100 : 0}%` }} />
                                </span>
                                <span className="w-6 text-right text-slate-500 tabular-nums">{d.count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {reviews === null ? (
                <div className="space-y-3" aria-hidden="true">{[0, 1].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
            ) : reviews.length === 0 ? (
                <p className="text-slate-500 text-sm bg-slate-50 rounded-xl p-6 text-center">
                    {canReview ? 'Nessuna recensione ancora: racconta per primo com’è nuotare qui.' : 'Nessuna recensione ancora.'}
                </p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {reviews.filter((r) => !blocks.isHidden(r.authorId)).map((r) => {
                        const a = authors[r.authorId];
                        return (
                            <li key={r.$id} className="py-5 first:pt-0">
                                <div className="flex items-start gap-3">
                                    <Link to={`/profile/${r.authorId}`} tabIndex={-1} aria-hidden="true" className="flex-shrink-0">
                                        <img src={avatarOf(a)} alt="" className="w-10 h-10 rounded-full object-cover" />
                                    </Link>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <Link to={`/profile/${r.authorId}`} className="font-semibold text-abisso hover:underline">{a ? displayNameOf(a) : 'Utente di SwimIn'}</Link>
                                            <Stars value={r.rating} />
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {formatRelativeTime(r.$createdAt)}
                                            {r.visitedAt && ` · visita di ${formatMonth(r.visitedAt)}`}
                                            {r.editedAt && ' · modificata'}
                                        </p>
                                        <p className="text-slate-700 mt-2 whitespace-pre-wrap leading-relaxed">{r.content}</p>

                                        {r.reply && replying !== r.$id && (
                                            <div className="mt-3 rounded-xl bg-piastrella border-l-4 border-corsia-400 px-4 py-3">
                                                <p className="text-xs font-semibold text-corsia-800">Risposta di {structureName}</p>
                                                <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{r.reply}</p>
                                            </div>
                                        )}
                                        {isManager && replying !== r.$id && (
                                            <button onClick={() => { setReplying(r.$id); setReplyText(r.reply || ''); }} className="mt-2 text-sm font-semibold text-corsia-700 hover:underline">
                                                {r.reply ? 'Modifica la risposta' : 'Rispondi'}
                                            </button>
                                        )}
                                        {isManager && replying === r.$id && (
                                            <div className="mt-3 space-y-2">
                                                <textarea
                                                    value={replyText}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                    rows={3}
                                                    maxLength={1100}
                                                    aria-label="Risposta della struttura"
                                                    className={fieldClass(replyText.length > 1000 ? 'x' : undefined, 'resize-y text-sm')}
                                                    placeholder="Ringrazia, chiarisci, racconta cosa state migliorando."
                                                />
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => setReplying(null)} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100">Annulla</button>
                                                    <button onClick={() => sendReply(r.$id)} className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-corsia-600 hover:bg-corsia-700">Pubblica risposta</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <ReviewModal open={open} structureName={structureName} existing={mine} onClose={() => setOpen(false)} onSubmit={submit} onDelete={mine ? remove : undefined} />
        </section>
    );
};
