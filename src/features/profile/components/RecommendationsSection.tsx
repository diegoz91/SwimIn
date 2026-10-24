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

const RELATIONSHIPS: { value: RecommendationRelationship; label: string }[] = [
    { value: 'collega', label: 'Abbiamo lavorato insieme' },
    { value: 'responsabile', label: 'Ero il suo responsabile' },
    { value: 'collaboratore', label: 'Era il mio responsabile' },
    { value: 'allievo', label: 'Mi ha allenato o insegnato' },
    { value: 'altro', label: 'Altro' },
];
const relationLabel = (r: RecommendationRelationship) =>
    ({ collega: 'Collega', responsabile: 'Suo responsabile', collaboratore: 'Collaboratore', allievo: 'Allievo', struttura: 'Struttura in cui ha lavorato', altro: 'Conoscenza professionale' })[r] || '';

type Values = { relationship: RecommendationRelationship; content: string };
const validate = (v: Values): FormErrors<Values> => ({
    content: check(v.content, required('Scrivi la referenza.'), minLength(50, 'Scrivi almeno 50 caratteri: com’è lavorare con questa persona?'), maxLength(3000)),
});

/**
 * Referenze scritte sul profilo di una persona. Chi la riceve decide se pubblicarla;
 * finché non lo fa la vedono solo autore e destinatario.
 */
export const RecommendationsSection: React.FC<{ profile: UserProfile; isOwnProfile: boolean; canWrite: boolean }> = ({ profile, isOwnProfile, canWrite }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const profileId = profile.userId || profile.$id;
    const firstName = profile.firstName || 'questa persona';
    const [items, setItems] = useState<Recommendation[] | null>(null);
    const [writing, setWriting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const sectionRef = useRef<HTMLElement>(null);
    const form = useForm<Values>({ relationship: 'collega', content: '' }, useCallback(validate, []));

    const load = useCallback(() => {
        databaseService.listRecommendations(profileId).then(setItems).catch((err) => { console.warn('Referenze:', err); setItems([]); });
    }, [profileId]);
    useEffect(load, [load]);

    // Da una notifica: ?sezione=referenze porta qui, ?referenza=scrivi apre il modulo.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('sezione') === 'referenze' && isOwnProfile) window.setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
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
            showToast(`Referenza inviata: comparirà sul profilo quando ${firstName} la pubblicherà.`, 'success');
            setWriting(false);
            load();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Referenza non inviata.', 'error');
        } finally {
            setSaving(false);
        }
    });

    const respond = async (r: Recommendation, action: 'publish' | 'hide' | 'delete') => {
        if (action === 'delete' && !window.confirm('Eliminare definitivamente questa referenza?')) return;
        try {
            await databaseService.respondRecommendation(r.$id, action);
            showToast(action === 'publish' ? 'Referenza pubblicata sul tuo profilo.' : action === 'hide' ? 'Referenza nascosta.' : 'Referenza eliminata.', 'success');
            load();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    const withdraw = async (r: Recommendation) => {
        if (!window.confirm('Ritirare la tua referenza?')) return;
        try {
            await databaseService.deleteRecommendation(r.$id);
            showToast('Referenza ritirata.', 'info');
            load();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    const published = (items || []).filter((r) => r.status === 'published');
    const pending = isOwnProfile ? (items || []).filter((r) => r.status === 'pending') : [];
    const hidden = isOwnProfile ? (items || []).filter((r) => r.status === 'hidden') : [];
    if (items === null) return null;
    if (!isOwnProfile && !canWrite && published.length === 0) return null;

    const card = (r: Recommendation, actions?: React.ReactNode) => {
        const long = r.content.length > 320;
        const open = expanded[r.$id];
        return (
            <li key={r.$id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                    <Link to={`/profile/${r.authorId}`} className="flex-shrink-0">
                        <img src={r.author.avatar || initialsAvatar(r.author.name)} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <Link to={`/profile/${r.authorId}`} className="font-semibold text-abisso hover:underline">{r.author.name}</Link>
                        <p className="text-sm text-slate-500">{[r.author.headline, relationLabel(r.relationship), formatDate(r.$createdAt.slice(0, 10), 'short')].filter(Boolean).join(' · ')}</p>
                        <p className="mt-2 text-slate-700 whitespace-pre-line break-words">{long && !open ? `${r.content.slice(0, 320).trimEnd()}…` : r.content}</p>
                        {long && (
                            <button onClick={() => setExpanded((e) => ({ ...e, [r.$id]: !open }))} className="py-1 -my-1 mt-1 text-sm font-semibold text-corsia-700 hover:underline">
                                {open ? 'Mostra meno' : 'Leggi tutto'}
                            </button>
                        )}
                        {actions && <div className="flex flex-wrap gap-2 mt-3">{actions}</div>}
                    </div>
                </div>
            </li>
        );
    };
    const btn = (label: string, onClick: () => void, tone: 'primary' | 'plain' | 'danger' = 'plain') => (
        <button onClick={onClick} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold ${tone === 'primary' ? 'bg-corsia-600 text-white hover:bg-corsia-700' : tone === 'danger' ? 'text-galleggiante hover:bg-red-50' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{label}</button>
    );

    return (
        <section ref={sectionRef} className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6 scroll-mt-20" aria-labelledby="recs-title">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 id="recs-title" className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Icon type="star" className="w-6 h-6 text-blue-600" /> Referenze
                    {published.length > 0 && <span className="text-sm font-semibold text-slate-500">· {published.length}</span>}
                </h2>
                {canWrite && !isOwnProfile && (
                    <button onClick={() => setWriting(true)} className="px-4 py-2 rounded-full text-sm font-semibold border border-corsia-200 text-corsia-700 hover:bg-corsia-50 flex items-center gap-1.5">
                        <Icon type="pencil" className="w-4 h-4" /> {mine ? 'Modifica la tua referenza' : `Scrivi una referenza`}
                    </button>
                )}
            </div>

            {pending.length > 0 && (
                <div className="mb-5 rounded-2xl border border-corsia-200 bg-corsia-50/50 p-4">
                    <p className="font-semibold text-abisso mb-3">Da approvare: le vedi solo tu</p>
                    <ul className="divide-y divide-corsia-100">
                        {pending.map((r) => card(r, <>{btn('Pubblica', () => respond(r, 'publish'), 'primary')}{btn('Nascondi', () => respond(r, 'hide'))}{btn('Elimina', () => respond(r, 'delete'), 'danger')}</>))}
                    </ul>
                </div>
            )}

            {published.length === 0 ? (
                <p className="text-slate-500">
                    {isOwnProfile
                        ? 'Ancora nessuna referenza. Chiedila a un collega o alla struttura per cui hai lavorato: dal loro profilo, menu “Altro” → “Chiedi una referenza”.'
                        : `Nessuna referenza pubblicata. Hai lavorato con ${firstName}? Scrivine una.`}
                </p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {published.map((r) => card(r, isOwnProfile ? btn('Nascondi', () => respond(r, 'hide')) : r.authorId === user?.$id ? btn('Ritira', () => withdraw(r), 'danger') : undefined))}
                </ul>
            )}

            {!isOwnProfile && mine && mine.status !== 'published' && (
                <p className="mt-4 text-sm text-slate-500">La tua referenza è in attesa che {firstName} la pubblichi. <button onClick={() => withdraw(mine)} className="py-1 -my-1 font-semibold text-galleggiante hover:underline">Ritirala</button></p>
            )}

            {hidden.length > 0 && (
                <details className="mt-5">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-600 py-1">Nascoste ({hidden.length})</summary>
                    <ul className="divide-y divide-slate-100 mt-3">
                        {hidden.map((r) => card(r, <>{btn('Pubblica', () => respond(r, 'publish'))}{btn('Elimina', () => respond(r, 'delete'), 'danger')}</>))}
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
