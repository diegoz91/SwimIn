import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { FormModal } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { Select } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService, type Recommendation, type RecommendationRelationship } from '@/services/database';
import { initialsAvatar } from '@/utils/avatar';
import { check, maxLength, minLength, required } from '@/utils/validation';
import { formatDate } from '@/utils/dates';
import type { UserProfile } from '@/types/types';
import { RELATIONSHIPS, relationLabel } from './recommendations/labels';
import type { useRecommendations } from './recommendations/useRecommendations';
import { useConfirm } from '@/context/ConfirmContext';

type Values = { relationship: RecommendationRelationship; content: string };
const validate = (v: Values): FormErrors<Values> => ({
    content: check(v.content, required('Scrivi la referenza.'), minLength(50, 'Scrivi almeno 50 caratteri: com’è lavorare con questa persona?'), maxLength(3000)),
});

const pill = {
    primary: 'px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60',
    secondary: 'px-4 py-2 rounded-full text-sm font-semibold border border-slate-300 text-abisso bg-white hover:bg-slate-50 disabled:opacity-60',
    quiet: 'px-3 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60',
    danger: 'px-3 py-2 rounded-full text-sm font-semibold text-galleggiante-700 hover:bg-red-50 disabled:opacity-60',
};

/**
 * Referenze sul profilo di una persona. Chi la riceve decide se pubblicarla; finché non lo fa
 * la vedono solo autore e destinatario. I dati arrivano da `useRecommendations` (condivisi con
 * l'avviso "da approvare" in cima al profilo).
 */
export const RecommendationsSection: React.FC<{
    profile: UserProfile;
    isOwnProfile: boolean;
    canWrite: boolean;
    recs: ReturnType<typeof useRecommendations>;
    onReview: (startId?: string) => void;
    onAsk: () => void;
}> = ({ profile, isOwnProfile, canWrite, recs, onReview, onAsk }) => {
    const confirm = useConfirm();
    const { user } = useAuth();
    const { showToast } = useToast();
    const profileId = profile.userId || profile.$id;
    const firstName = profile.firstName || 'questa persona';
    const { items, reload, published } = recs;
    // Da approvare e non pubblicate: solo il proprietario del profilo le gestisce. Chi ha scritto una
    // referenza in attesa la vede (la riga è leggibile anche a lui) ma solo come stato, più sotto.
    const pending = isOwnProfile ? recs.pending : [];
    const hidden = isOwnProfile ? recs.hidden : [];
    const [writing, setWriting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const sectionRef = useRef<HTMLElement>(null);
    const form = useForm<Values>({ relationship: 'collega', content: '' }, useCallback(validate, []));

    // Da una notifica: ?sezione=referenze porta qui, ?referenza=scrivi apre il modulo.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('sezione') === 'referenze') window.setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
        if (params.get('referenza') === 'scrivi' && canWrite) setWriting(true);
    }, [isOwnProfile, canWrite]);

    const mine = items?.find((r) => r.authorId === user?.$id);
    useEffect(() => {
        if (writing) form.reset({ relationship: mine?.relationship && mine.relationship !== 'struttura' ? mine.relationship : 'collega', content: mine?.content || '' });
    }, [writing]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        try {
            await databaseService.writeRecommendation(profileId, v.relationship, v.content.trim());
            showToast(mine ? `Referenza aggiornata: ${firstName} la rivedrà prima di pubblicarla.` : `Referenza inviata a ${firstName}. Comparirà sul suo profilo quando deciderà di pubblicarla.`, 'success');
            setWriting(false);
            reload();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Referenza non inviata.', 'error');
        } finally {
            setSaving(false);
        }
    });

    const respond = async (r: Recommendation, action: 'publish' | 'hide' | 'delete') => {
        setBusyId(r.$id);
        try {
            await databaseService.respondRecommendation(r.$id, action);
            showToast(action === 'publish' ? 'Referenza pubblicata sul tuo profilo.' : action === 'hide' ? 'Referenza tolta dal profilo: la trovi tra le non pubblicate.' : 'Referenza eliminata.', 'success');
            reload();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const withdraw = async (r: Recommendation) => {
        if (!(await confirm({ title: 'Ritirare la tua referenza?', message: 'Non sarà più visibile e dovrai riscriverla da capo.', confirmLabel: 'Ritira', tone: 'danger' }))) return;
        try {
            await databaseService.deleteRecommendation(r.$id);
            showToast('Referenza ritirata.', 'info');
            reload();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    if (items === null) return null;
    if (!isOwnProfile && !canWrite && published.length === 0) return null;

    const card = (r: Recommendation, actions?: React.ReactNode, clamp = 320) => {
        const long = r.content.length > clamp;
        const open = expanded[r.$id];
        return (
            <li key={r.$id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                    <Link to={`/profile/${r.authorId}`} tabIndex={-1} aria-hidden="true" className="flex-shrink-0">
                        <img src={r.author.avatar || initialsAvatar(r.author.name)} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <Link to={`/profile/${r.authorId}`} className="font-semibold text-abisso hover:underline">{r.author.name}</Link>
                        <p className="text-sm text-slate-500">{[r.author.headline, relationLabel(r.relationship), formatDate(r.$createdAt.slice(0, 10), 'short')].filter(Boolean).join(' · ')}</p>
                        <p className="mt-2 text-slate-700 whitespace-pre-line break-words">{long && !open ? `${r.content.slice(0, clamp).trimEnd()}…` : r.content}</p>
                        {long && (
                            <button onClick={() => setExpanded((e) => ({ ...e, [r.$id]: !open }))} className="py-1 -my-1 mt-1 text-sm font-semibold text-corsia-700 hover:underline">
                                {open ? 'Mostra meno' : 'Leggi tutto'}
                            </button>
                        )}
                        {actions && <div className="flex flex-wrap items-center gap-2 mt-3">{actions}</div>}
                    </div>
                </div>
            </li>
        );
    };

    return (
        <section ref={sectionRef} id="referenze" className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6 scroll-mt-20" aria-labelledby="recs-title">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 id="recs-title" className="text-xl font-bold text-abisso flex items-center gap-2">
                    <Icon type="star" className="w-6 h-6 text-blue-600" /> Referenze
                    {published.length > 0 && <span className="text-sm font-semibold text-slate-500">· {published.length}</span>}
                </h2>
                {isOwnProfile ? (
                    <button onClick={onAsk} className={`${pill.secondary} flex items-center gap-1.5`}>
                        <Icon type="plus" className="w-4 h-4" /> Chiedi una referenza
                    </button>
                ) : canWrite && (
                    <button onClick={() => setWriting(true)} className="px-4 py-2 rounded-full text-sm font-semibold border border-corsia-200 text-corsia-700 hover:bg-corsia-50 flex items-center gap-1.5">
                        <Icon type="pencil" className="w-4 h-4" /> {mine ? 'Modifica la tua referenza' : 'Scrivi una referenza'}
                    </button>
                )}
            </div>

            {pending.length > 0 && (
                <div className="mb-6 rounded-2xl border-2 border-corsia-200 bg-corsia-50/60 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <p className="font-semibold text-abisso">
                            {pending.length === 1 ? 'Una referenza da approvare' : `${pending.length} referenze da approvare`}
                            <span className="block text-sm font-normal text-slate-600">Le vedi solo tu: decidi se pubblicarle sul profilo.</span>
                        </p>
                        {pending.length > 1 && <button onClick={() => onReview()} className={pill.secondary}>Rivedile una per una</button>}
                    </div>
                    <ul className="divide-y divide-corsia-100">
                        {pending.map((r) => card(r, (
                            <>
                                <button onClick={() => respond(r, 'publish')} disabled={busyId === r.$id} className={pill.primary}>Pubblica</button>
                                <button onClick={() => respond(r, 'hide')} disabled={busyId === r.$id} className={pill.secondary}>Non pubblicare</button>
                                <button onClick={() => onReview(r.$id)} className={pill.quiet}>Altre opzioni</button>
                            </>
                        ), 220))}
                    </ul>
                </div>
            )}

            {published.length === 0 ? (
                isOwnProfile ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center">
                        <p className="font-semibold text-abisso">Ancora nessuna referenza pubblicata</p>
                        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Le strutture si fidano di chi ha lavorato con te. Chiedi due righe a un collega o alla piscina della scorsa stagione.</p>
                        <button onClick={onAsk} className={`${pill.primary} mt-4`}>Chiedi una referenza</button>
                    </div>
                ) : (
                    !(mine && mine.status !== 'published') && <p className="text-slate-500">{canWrite ? `Nessuna referenza pubblicata. Hai lavorato con ${firstName}? Scrivine una.` : 'Nessuna referenza pubblicata.'}</p>
                )
            ) : (
                <ul className="divide-y divide-slate-100">
                    {published.map((r) => card(r, isOwnProfile ? (
                        <button onClick={() => respond(r, 'hide')} disabled={busyId === r.$id} className={pill.quiet}>Togli dal profilo</button>
                    ) : r.authorId === user?.$id ? (
                        <button onClick={() => withdraw(r)} className={pill.danger}>Ritira</button>
                    ) : undefined))}
                </ul>
            )}

            {!isOwnProfile && mine && mine.status !== 'published' && (
                <div className={`${published.length ? 'mt-5' : ''} rounded-2xl border border-slate-200 bg-piastrella/60 p-4 sm:p-5`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <p className="font-semibold text-abisso">La tua referenza</p>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${mine.status === 'pending' ? 'bg-corsia-50 text-corsia-800 border-corsia-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            <Icon type="clock" className="w-3.5 h-3.5" /> {mine.status === 'pending' ? 'In attesa di approvazione' : 'Non pubblicata'}
                        </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-3">
                        {mine.status === 'pending'
                            ? `Inviata a ${firstName}: la vedete solo voi due finché non decide di pubblicarla sul suo profilo.`
                            : `${firstName} ha scelto di non pubblicarla sul profilo. Resta visibile solo a voi due.`}
                    </p>
                    <p className="text-slate-700 whitespace-pre-line break-words rounded-xl bg-white border border-slate-100 p-3">{mine.content}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => setWriting(true)} className={pill.secondary}>Modifica</button>
                        <button onClick={() => withdraw(mine)} className={pill.danger}>Ritira</button>
                    </div>
                </div>
            )}

            {hidden.length > 0 && (
                <details className="mt-5 group">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-600 py-1 list-none flex items-center gap-1.5">
                        <Icon type="chevron-right" className="w-4 h-4 transition-transform group-open:rotate-90" /> Non pubblicate ({hidden.length})
                    </summary>
                    <ul className="divide-y divide-slate-100 mt-3">
                        {hidden.map((r) => card(r, (
                            <>
                                <button onClick={() => respond(r, 'publish')} disabled={busyId === r.$id} className={pill.secondary}>Pubblica</button>
                                <button onClick={async () => { if (await confirm({ title: 'Eliminare la referenza?', message: 'La elimini definitivamente: non si può recuperare.', confirmLabel: 'Elimina', tone: 'danger' })) void respond(r, 'delete'); }} disabled={busyId === r.$id} className={pill.danger}>Elimina</button>
                            </>
                        )))}
                    </ul>
                </details>
            )}

            <FormModal
                open={writing}
                title={`Referenza per ${firstName}`}
                description="Racconta com’è lavorare con questa persona: competenze, affidabilità, un episodio concreto. La vedrà prima lei, poi deciderà se pubblicarla."
                icon="star"
                size="lg"
                dirty={form.isDirty}
                busy={saving}
                submitLabel={mine ? 'Aggiorna la referenza' : 'Invia la referenza'}
                busyLabel="Invio…"
                onClose={() => setWriting(false)}
                onSubmit={submit}
                formRef={form.formRef}
            >
                {user?.userType !== 'structure' && (
                    <Field id="rec-rel" label="Come vi conoscete">
                        <Select label="Come vi conoscete" value={form.values.relationship} onChange={(v) => form.set('relationship', v as RecommendationRelationship)} options={RELATIONSHIPS} />
                    </Field>
                )}
                <Field id="rec-text" label="La tua referenza" error={form.errors.content} count={{ value: form.values.content, max: 3000 }}>
                    <textarea {...form.bind('content')} rows={7} className={fieldClass(form.errors.content, 'resize-y')} placeholder={`Es. Ho lavorato con ${firstName} per due stagioni alla piscina comunale: puntuale, attenta alla sicurezza in vasca e molto brava con i bambini…`} />
                </Field>
            </FormModal>
        </section>
    );
};
