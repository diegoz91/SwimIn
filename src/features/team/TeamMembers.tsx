import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, databaseService, type PendingStaffInvite, type TeamMember } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { FormModal } from '@/components/form/FormModal';
import { avatarOf, displayNameOf } from '@/utils/profile';
import { formatRelativeTime } from '@/utils/format';
import { formatDate } from '@/utils/dates';
import type { Certification, UserProfile } from '@/types/types';

const certsOf = (m: TeamMember): Certification[] =>
    (m.certificationsList || []).flatMap((c) => {
        try {
            return [JSON.parse(c) as Certification];
        } catch {
            return [];
        }
    });
const daysTo = (iso?: string) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);

interface Props {
    structureId: string;
    structureName: string;
    isAdmin: boolean;
    currentUserId?: string;
    members: TeamMember[];
    invites: PendingStaffInvite[];
    staffLimit: number | null;
    loading: boolean;
    onRemove: (userId: string) => void;
    onChanged: () => void;
}

/**
 * Squadra: le persone dello staff, visibili a tutto il team. Gli amministratori invitano
 * chi lavora già in struttura, vedono gli inviti in attesa e le scadenze dei brevetti.
 */
export const TeamMembers: React.FC<Props> = ({ structureId, structureName, isAdmin, currentUserId, members, invites, staffLimit, loading, onRemove, onChanged }) => {
    const { showToast } = useToast();
    const [inviting, setInviting] = useState(false);
    const used = members.length + invites.length;

    const cancel = async (userId: string) => {
        try {
            await databaseService.cancelStaffInvite(structureId, userId);
            showToast('Invito ritirato.', 'info');
            onChanged();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    if (loading) {
        return <div className="p-6 space-y-3" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />)}</div>;
    }

    return (
        <div className="p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-xl font-bold text-abisso">Squadra</h3>
                    <p className="text-sm text-slate-600">
                        {members.length === 0 ? 'Nessuno nello staff per ora.' : members.length === 1 ? '1 persona nello staff' : `${members.length} persone nello staff`}
                        {isAdmin && staffLimit !== null && <> · {used} di {staffLimit} con il piano Base</>}
                    </p>
                </div>
                {isAdmin && (
                    <button onClick={() => setInviting(true)} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 inline-flex items-center gap-1.5">
                        <Icon type="user-plus" className="w-4 h-4" /> Invita nello staff
                    </button>
                )}
            </div>
            {isAdmin && staffLimit !== null && used >= staffLimit && (
                <p className="rounded-2xl bg-oro-50 border border-oro-200 px-4 py-3 text-sm text-slate-800">
                    Hai raggiunto le {staffLimit} persone del piano Base. <Link to="/premium" className="font-semibold text-oro-700 hover:underline py-1 -my-1">Con Premium la squadra non ha limiti.</Link>
                </p>
            )}

            {isAdmin && invites.length > 0 && (
                <section aria-labelledby="invites-title">
                    <h4 id="invites-title" className="text-sm font-semibold text-abisso">In attesa di risposta</h4>
                    <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
                        {invites.map((i) => (
                            <li key={i.userId} className="flex items-center gap-3 px-4 py-3">
                                <img src={i.avatar || avatarOf({ firstName: i.name } as Partial<UserProfile>)} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-100" />
                                <div className="min-w-0 flex-1">
                                    <Link to={`/profile/${i.userId}`} className="font-semibold text-abisso hover:underline">{i.name}</Link>
                                    <p className="text-xs text-slate-500 truncate">{[i.title, `invitato ${formatRelativeTime(i.invitedAt)}`].filter(Boolean).join(' · ')}</p>
                                </div>
                                <button onClick={() => cancel(i.userId)} className="py-1 -my-1 text-sm font-semibold text-slate-600 hover:text-galleggiante-700">Ritira</button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {members.length === 0 ? (
                <div className="text-center py-10 rounded-2xl border border-dashed border-slate-300">
                    <Icon type="users" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold text-abisso">La squadra è ancora vuota</p>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                        {isAdmin ? 'Invita chi lavora già da voi, oppure assumi da un annuncio: entrano nello staff con bacheca, turni e chat.' : 'Qui compariranno i colleghi.'}
                    </p>
                </div>
            ) : (
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                    {members.map((m) => {
                        const name = `${m.firstName} ${m.lastName}`.trim() || 'Membro dello staff';
                        const certs = certsOf(m);
                        const problems = certs.filter((c) => {
                            const d = daysTo(c.expiry);
                            return d !== null && d <= 30;
                        });
                        return (
                            <li key={m.userId} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="relative flex-shrink-0">
                                        <img src={m.avatar || avatarOf(m as unknown as Partial<UserProfile>)} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
                                        {m.isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-cloro-500 border-2 border-white"><span className="sr-only">Online</span></span>}
                                    </div>
                                    <div className="min-w-0">
                                        <Link to={`/profile/${m.userId}`} className="font-semibold text-abisso hover:underline">{name}{m.userId === currentUserId && <span className="ml-1 text-xs font-normal text-slate-500">(tu)</span>}</Link>
                                        <p className="text-sm text-slate-500 truncate">{m.title || 'Professionista'}</p>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="sm:w-64 text-sm">
                                        {certs.length === 0 ? (
                                            <span className="text-slate-500">Nessun brevetto nel profilo</span>
                                        ) : problems.length ? (
                                            <ul className="space-y-0.5">
                                                {problems.slice(0, 2).map((c, k) => {
                                                    const d = daysTo(c.expiry)!;
                                                    return <li key={k} className="text-galleggiante-700"><span className="font-semibold">{c.name}</span>: {d < 0 ? 'scaduto' : `scade il ${formatDate(c.expiry!.slice(0, 10), 'short')}`}</li>;
                                                })}
                                            </ul>
                                        ) : (
                                            <span className="text-cloro-800 inline-flex items-center gap-1"><Icon type="check" className="w-4 h-4" /> Brevetti in regola ({certs.length})</span>
                                        )}
                                    </div>
                                )}
                                <div className="flex items-center gap-1 sm:justify-end">
                                    {m.userId !== currentUserId && (
                                        <Link to={`/messages?u=${encodeURIComponent(m.userId)}`} className="w-9 h-9 rounded-full grid place-items-center text-corsia-700 hover:bg-corsia-50" aria-label={`Scrivi a ${name}`}>
                                            <Icon type="chat-bubble" className="w-5 h-5" />
                                        </Link>
                                    )}
                                    {isAdmin && (
                                        <button onClick={() => onRemove(m.userId)} className="w-9 h-9 rounded-full grid place-items-center text-slate-500 hover:text-galleggiante-700 hover:bg-red-50" aria-label={`Togli ${name} dallo staff`}>
                                            <Icon type="user-minus" className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {isAdmin && (
                <InviteModal
                    open={inviting}
                    structureId={structureId}
                    structureName={structureName}
                    exclude={new Set([...members.map((m) => m.userId), ...invites.map((i) => i.userId)])}
                    onClose={() => setInviting(false)}
                    onInvited={() => {
                        setInviting(false);
                        onChanged();
                    }}
                />
            )}
        </div>
    );
};

const InviteModal: React.FC<{ open: boolean; structureId: string; structureName: string; exclude: Set<string>; onClose: () => void; onInvited: () => void }> = ({ open, structureId, structureName, exclude, onClose, onInvited }) => {
    const { showToast } = useToast();
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<UserProfile[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setTerm('');
            setResults(null);
            return;
        }
        if (term.trim().length < 2) {
            setResults(null);
            return;
        }
        const t = window.setTimeout(() => {
            databaseService
                .searchTalent({ search: term.trim() })
                .then((list) => setResults(list.filter((p) => !exclude.has(p.$id)).slice(0, 12)))
                .catch((err) => {
                    console.error('Ricerca:', err);
                    setResults([]);
                });
        }, 250);
        return () => window.clearTimeout(t);
    }, [open, term]); // eslint-disable-line react-hooks/exhaustive-deps

    const invite = async (p: UserProfile) => {
        setBusy(p.$id);
        try {
            const r = await databaseService.inviteStaff(structureId, p.$id);
            showToast(r.already ? `${displayNameOf(p)} ha già un invito in attesa.` : `Invito inviato a ${displayNameOf(p)}: entra nello staff quando accetta.`, 'success');
            onInvited();
        } catch (err) {
            // Limite del piano Base: l'invito a Premium si apre da solo.
            if (!(err instanceof ApiError && err.code === 'premium_required')) showToast(err instanceof Error ? err.message : 'Invito non inviato.', 'error');
        } finally {
            setBusy(null);
        }
    };

    return (
        <FormModal
            open={open}
            title="Invita nello staff"
            description={`Per chi lavora già a ${structureName}: riceve una notifica ed entra quando accetta.`}
            icon="user-plus"
            submitLabel="Chiudi"
            cancelLabel={null}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                onClose();
            }}
        >
            <label htmlFor="invite-search" className="block text-sm font-semibold text-abisso">Cerca per nome, cognome o qualifica</label>
            <input
                id="invite-search"
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                autoComplete="off"
                placeholder="Es. Giulia Ferri"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100"
            />
            <div aria-live="polite">
                {results === null ? (
                    <p className="text-sm text-slate-500">Scrivi almeno due lettere.</p>
                ) : results.length === 0 ? (
                    <p className="text-sm text-slate-500">Nessun professionista trovato. Chi non è ancora su SwimIn può iscriversi e poi ricevere l’invito.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                        {results.map((p) => (
                            <li key={p.$id} className="flex items-center gap-3 px-3 py-2.5">
                                <img src={avatarOf(p)} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-100" />
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-abisso truncate">{displayNameOf(p)}</p>
                                    <p className="text-xs text-slate-500 truncate">{[p.title, p.city].filter(Boolean).join(' · ')}</p>
                                </div>
                                <button type="button" disabled={busy === p.$id} onClick={() => invite(p)} className="px-3 py-1.5 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60">
                                    Invita
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </FormModal>
    );
};
