import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useSignal } from '@/hooks/useSignal';
import { useLiveCollection } from '@/hooks/useLiveCollection';
import { useToast } from '@/context/ToastContext';
import { useBlocks } from '@/context/BlocksContext';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { PostCard } from '@/features/feed/components/PostCard';
import { PostCreator } from '@/features/feed/components/PostCreator';
import { GroupFormModal } from '@/features/groups/GroupFormModal';
import { EventCard } from '@/features/events/EventCard';
import { EventFormModal } from '@/features/events/EventFormModal';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { groupCategoryLabel } from '@/data/groups';
import { provinceName } from '@/data/italy';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { isPremium } from '@/utils/premium';
import { formatDate } from '@/utils/dates';
import type { EnrichedPost, Group, GroupMember, StructureProfile, SwimMeet, UserProfile } from '@/types/types';
import { useConfirm } from '@/context/ConfirmContext';

type Profile = UserProfile | StructureProfile;

type Tab = 'discussione' | 'eventi' | 'membri' | 'info';
type Moderation = 'approve' | 'reject' | 'remove' | 'ban' | 'promote' | 'demote';

async function profilesFor(ids: string[]) {
    const out: Profile[] = [];
    for (let i = 0; i < ids.length; i += 100) out.push(...(await databaseService.getProfilesByIds(ids.slice(i, i + 100))));
    return new Map(out.map((p) => [p.$id, p]));
}

/** Pagina di un gruppo: discussione, membri (con richieste e moderazione) e informazioni. */
const GroupPage: React.FC = () => {
    const confirm = useConfirm();
    const { id = '' } = useParams();
    const { user } = useAuth();
    const { showToast } = useToast();
    const blocks = useBlocks();
    const navigate = useNavigate();
    const [group, setGroup] = useState<Group | null | undefined>(undefined);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
    const [posts, setPosts] = useState<EnrichedPost[] | null>(null);
    const [tab, setTab] = useState<Tab>('discussione');
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [events, setEvents] = useState<SwimMeet[] | null>(null);
    const [creatingEvent, setCreatingEvent] = useState(false);
    usePageTitle(group?.name || 'Gruppo');

    const loadMembers = useCallback(async () => {
        const rows = await databaseService.getGroupMembers(id);
        setMembers(rows);
        setProfiles(await profilesFor(rows.map((r) => r.userId)));
    }, [id]);

    const loadPosts = useCallback(async () => {
        if (!user) return;
        try {
            setPosts(await databaseService.getGroupPosts(id, user.$id));
        } catch (err) {
            console.error('Post del gruppo:', err);
            setPosts([]);
        }
    }, [id, user]);

    useEffect(() => {
        let alive = true;
        setGroup(undefined);
        setPosts(null);
        databaseService
            .getGroup(id)
            .then((g) => alive && setGroup(g))
            .catch((err) => { console.warn('Gruppo:', err); if (alive) setGroup(null); });
        loadMembers().catch((err) => console.error('Membri del gruppo:', err));
        loadPosts();
        setEvents(null);
        databaseService.getGroupEvents(id).then((e) => alive && setEvents(e)).catch((err) => { console.warn('Eventi del gruppo:', err); if (alive) setEvents([]); });
        return () => { alive = false; };
    }, [id, loadMembers, loadPosts]);

    // Tempo reale: richieste di ingresso, membri approvati o rimossi.
    useSignal(`group:${id}`, () => {
        databaseService.getGroup(id).then(setGroup).catch((err) => console.warn('Gruppo (aggiornamento):', err));
        loadMembers().catch((err) => console.error('Membri del gruppo:', err));
    });
    useLiveCollection('posts', (changes) => { if (changes.some((c) => c.payload.groupId === id)) void loadPosts(); }, 600);

    const me = user ? members.find((m) => m.userId === user.$id) : undefined;
    const isAdmin = !!user && !!group?.admins?.includes(user.$id);
    const isMember = me?.status === 'active';
    const active = useMemo(() => members.filter((m) => m.status === 'active' && !blocks.isHidden(m.userId)), [members, blocks]);
    const pending = members.filter((m) => m.status === 'pending');
    const banned = members.filter((m) => m.status === 'banned');
    const shownPosts = (posts || []).filter((p) => !blocks.isMutedOrHidden(p.authorId));

    const refreshGroup = async () => setGroup(await databaseService.getGroup(id));

    const join = async () => {
        setBusy(true);
        try {
            const { status } = await databaseService.joinGroup(id);
            showToast(status === 'active' ? 'Sei entrato nel gruppo.' : 'Richiesta inviata: un amministratore la approverà.', 'success');
            await Promise.all([loadMembers(), refreshGroup()]);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const leave = async () => {
        if (me?.status === 'active' && !(await confirm({ title: `Lasciare «${group?.name}»?`, message: 'Non vedrai più i post del gruppo; potrai rientrare quando vuoi.', confirmLabel: 'Lascia il gruppo' }))) return;
        setBusy(true);
        try {
            await databaseService.leaveGroup(id);
            showToast(me?.status === 'pending' ? 'Richiesta annullata.' : 'Hai lasciato il gruppo.', 'info');
            await Promise.all([loadMembers(), refreshGroup()]);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const moderate = async (userId: string, action: Moderation) => {
        const name = profiles.get(userId) ? displayNameOf(profiles.get(userId)!) : 'questa persona';
        if (action === 'ban' && !(await confirm({ title: `Bloccare ${name}?`, message: 'Non potrà più rientrare nel gruppo.', confirmLabel: 'Blocca', tone: 'danger' }))) return;
        if (action === 'remove' && !(await confirm({ title: `Rimuovere ${name} dal gruppo?`, confirmLabel: 'Rimuovi', tone: 'danger' }))) return;
        try {
            await databaseService.moderateGroupMember(id, userId, action);
            const done: Record<Moderation, string> = {
                approve: `${name} è entrato nel gruppo.`, reject: 'Richiesta rifiutata.', remove: `${name} è stato rimosso.`,
                ban: `${name} è stato bloccato.`, promote: `${name} ora è amministratore.`, demote: `${name} non è più amministratore.`,
            };
            showToast(done[action], 'success');
            await Promise.all([loadMembers(), refreshGroup()]);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    const remove = async () => {
        if (!group || !(await confirm({ title: `Eliminare «${group.name}»?`, message: 'Il gruppo e tutti i suoi post spariscono definitivamente.', confirmLabel: 'Elimina il gruppo', tone: 'danger' }))) return;
        try {
            await databaseService.deleteGroup(id);
            showToast('Gruppo eliminato.', 'info');
            navigate('/gruppi');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
        }
    };

    if (group === null) {
        return (
            <div className="pt-16 max-w-md mx-auto text-center">
                <Icon type="users" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <h1 className="text-3xl font-bold text-abisso">Gruppo non trovato</h1>
                <p className="text-slate-500 mt-2">Potrebbe essere stato eliminato dagli amministratori.</p>
                <Link to="/gruppi" className="inline-block mt-5 px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Vai ai gruppi</Link>
            </div>
        );
    }
    if (!group) {
        return <div className="pt-4 max-w-3xl mx-auto w-full" aria-hidden="true"><div className="h-56 bg-white border border-slate-200 rounded-2xl animate-pulse" /></div>;
    }

    const tabs: { key: Tab; label: string }[] = [
        { key: 'discussione', label: 'Discussione' },
        { key: 'eventi', label: events?.length ? `Eventi · ${events.length}` : 'Eventi' },
        { key: 'membri', label: isAdmin && pending.length ? `Membri · ${pending.length} in attesa` : 'Membri' },
        { key: 'info', label: 'Informazioni' },
    ];

    const memberRow = (m: GroupMember, actions: React.ReactNode) => {
        const p = profiles.get(m.userId);
        return (
            <li key={m.$id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <Link to={`/profile/${m.userId}`} tabIndex={-1} aria-hidden="true" className="flex-shrink-0">
                    <img src={p ? avatarOf(p) : ''} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
                </Link>
                <Link to={`/profile/${m.userId}`} className="min-w-0 flex-1">
                    <p className="font-semibold text-abisso truncate flex items-center gap-1.5">
                        {p ? displayNameOf(p) : 'Utente'}
                        {p && isPremium(p) && <PremiumBadge size="sm" />}
                        {group.admins?.includes(m.userId) && <span className="text-xs font-semibold text-corsia-700 bg-corsia-50 px-2 py-0.5 rounded-full">Amministratore</span>}
                    </p>
                    <p className="text-sm text-slate-500 truncate">{p ? headlineOf(p) : ''}</p>
                </Link>
                {actions && <div className="w-full sm:w-auto pl-12 sm:pl-0 -ml-3 sm:ml-0 flex flex-wrap sm:justify-end gap-1.5">{actions}</div>}
            </li>
        );
    };
    const smallBtn = (label: string, onClick: () => void, tone: 'primary' | 'plain' | 'danger' = 'plain') => (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                tone === 'primary' ? 'bg-corsia-600 text-white hover:bg-corsia-700' : tone === 'danger' ? 'text-galleggiante-700 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="pt-4 max-w-3xl mx-auto w-full">
            <section className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
                <div className="h-32 sm:h-44 bg-gradient-to-br from-corsia-700 to-cloro-500 relative">
                    {group.cover && <img src={group.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                </div>
                <div className="p-5">
                    <h1 className="text-4xl font-bold text-abisso leading-tight break-words">{group.name}</h1>
                    <p className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="flex items-center gap-1">
                            <Icon type={group.privacy === 'approval' ? 'lock-closed' : 'globe'} className="w-4 h-4" />
                            {group.privacy === 'approval' ? 'Su approvazione' : 'Aperto'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{groupCategoryLabel(group.category)}</span>
                        {group.province && (<><span aria-hidden="true">·</span><span>{provinceName(group.province) || group.province}</span></>)}
                        <span aria-hidden="true">·</span>
                        <button onClick={() => setTab('membri')} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">
                            {group.membersCount === 1 ? '1 membro' : `${(group.membersCount || 0).toLocaleString('it-IT')} membri`}
                        </button>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                        {!me && (
                            <button onClick={join} disabled={busy} className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60 flex items-center gap-2">
                                <Icon type="plus" className="w-5 h-5" /> {group.privacy === 'approval' ? 'Chiedi di entrare' : 'Entra nel gruppo'}
                            </button>
                        )}
                        {me?.status === 'pending' && (
                            <button onClick={leave} disabled={busy} className="px-5 py-2.5 rounded-full font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50">
                                Richiesta inviata · annulla
                            </button>
                        )}
                        {isMember && (
                            <button onClick={leave} disabled={busy} className="px-5 py-2.5 rounded-full font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                <Icon type="check" className="w-5 h-5" /> Membro · lascia
                            </button>
                        )}
                        {me?.status === 'banned' && <p className="text-sm text-slate-500 self-center">Non puoi partecipare a questo gruppo.</p>}
                        {isAdmin && (
                            <button onClick={() => setEditing(true)} className="px-5 py-2.5 rounded-full font-semibold text-corsia-700 hover:bg-corsia-50 flex items-center gap-2">
                                <Icon type="pencil" className="w-4 h-4" /> Modifica
                            </button>
                        )}
                    </div>
                </div>
                <nav className="flex border-t border-slate-100 overflow-x-auto" aria-label="Sezioni del gruppo">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            aria-current={tab === t.key ? 'page' : undefined}
                            className={`px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 ${tab === t.key ? 'border-corsia-600 text-corsia-700' : 'border-transparent text-slate-500 hover:text-abisso'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </nav>
            </section>

            <div className="mt-4 space-y-4">
                {tab === 'discussione' && (
                    <>
                        {isMember ? (
                            <PostCreator groupId={group.$id} placeholder={`Scrivi nel gruppo ${group.name}`} onPostCreated={() => { loadPosts(); refreshGroup(); }} />
                        ) : (
                            me?.status !== 'banned' && (
                                <p className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 text-sm text-slate-600">
                                    {me?.status === 'pending' ? 'Potrai scrivere appena la tua richiesta sarà approvata.' : 'Entra nel gruppo per scrivere e commentare con gli altri membri.'}
                                </p>
                            )
                        )}
                        {posts === null ? (
                            <div className="h-48 bg-white border border-slate-200 rounded-2xl animate-pulse" aria-hidden="true" />
                        ) : shownPosts.length === 0 ? (
                            <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                                <p className="font-semibold text-abisso">Ancora nessuna discussione.</p>
                                <p className="text-sm text-slate-500 mt-1">{isMember ? 'Rompi il ghiaccio: presentati o fai una domanda.' : 'Entra e apri tu la prima.'}</p>
                            </div>
                        ) : (
                            shownPosts.map((p) => (
                                <PostCard
                                    key={p.$id}
                                    post={p}
                                    canModerate={isAdmin}
                                    onSelectPost={(post) => navigate(`/post/${post.$id}`, { state: { post } })}
                                    onDeleted={(pid) => { setPosts((prev) => (prev || []).filter((x) => x.$id !== pid)); refreshGroup(); }}
                                />
                            ))
                        )}
                    </>
                )}

                {tab === 'eventi' && (
                    <>
                        {isMember && (
                            <div className="flex justify-end">
                                <button onClick={() => setCreatingEvent(true)} className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700 flex items-center gap-2">
                                    <Icon type="plus" className="w-5 h-5" /> Crea un evento del gruppo
                                </button>
                            </div>
                        )}
                        {events === null ? (
                            <div className="h-32 bg-white border border-slate-200 rounded-2xl animate-pulse" aria-hidden="true" />
                        ) : events.length === 0 ? (
                            <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                                <p className="font-semibold text-abisso">Nessun evento in programma.</p>
                                <p className="text-sm text-slate-500 mt-1">{isMember ? 'Proponi un allenamento insieme, una trasferta o un corso.' : 'Entra nel gruppo per proporne uno.'}</p>
                            </div>
                        ) : (
                            <ul className="grid sm:grid-cols-2 gap-4">
                                {events.map((e) => <li key={e.$id} className="min-w-0"><EventCard event={e} currentUserId={user?.$id} /></li>)}
                            </ul>
                        )}
                    </>
                )}

                {tab === 'membri' && (
                    <>
                        {isAdmin && pending.length > 0 && (
                            <section className="bg-white rounded-2xl border border-amber-200 shadow-card overflow-hidden" aria-labelledby="pending-title">
                                <h2 id="pending-title" className="px-4 pt-4 pb-1 text-xl font-bold text-abisso">Richieste da approvare</h2>
                                <ul className="divide-y divide-slate-100">
                                    {pending.map((m) => memberRow(m, <>{smallBtn('Rifiuta', () => moderate(m.userId, 'reject'))}{smallBtn('Approva', () => moderate(m.userId, 'approve'), 'primary')}</>))}
                                </ul>
                            </section>
                        )}
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden" aria-labelledby="members-title">
                            <h2 id="members-title" className="px-4 pt-4 pb-1 text-xl font-bold text-abisso">Membri</h2>
                            <ul className="divide-y divide-slate-100">
                                {active.map((m) =>
                                    memberRow(
                                        m,
                                        isAdmin && m.userId !== user?.$id ? (
                                            <>
                                                {group.admins?.includes(m.userId)
                                                    ? smallBtn('Togli amministratore', () => moderate(m.userId, 'demote'))
                                                    : smallBtn('Nomina amministratore', () => moderate(m.userId, 'promote'))}
                                                {smallBtn('Rimuovi', () => moderate(m.userId, 'remove'))}
                                                {smallBtn('Blocca', () => moderate(m.userId, 'ban'), 'danger')}
                                            </>
                                        ) : null
                                    )
                                )}
                            </ul>
                        </section>
                        {isAdmin && banned.length > 0 && (
                            <section className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden" aria-labelledby="banned-title">
                                <h2 id="banned-title" className="px-4 pt-4 pb-1 text-xl font-bold text-abisso">Bloccati</h2>
                                <ul className="divide-y divide-slate-100">
                                    {banned.map((m) => memberRow(m, smallBtn('Sblocca', () => moderate(m.userId, 'reject'))))}
                                </ul>
                            </section>
                        )}
                    </>
                )}

                {tab === 'info' && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-5">
                        <div>
                            <h2 className="text-xl font-bold text-abisso mb-1.5">Di cosa si parla</h2>
                            <p className="text-slate-700 whitespace-pre-line">{group.description}</p>
                        </div>
                        {group.rules && (
                            <div>
                                <h2 className="text-xl font-bold text-abisso mb-1.5">Regole</h2>
                                <p className="text-slate-700 whitespace-pre-line">{group.rules}</p>
                            </div>
                        )}
                        <p className="text-sm text-slate-500">Creato il {formatDate(group.$createdAt.slice(0, 10))}. I post del gruppo sono visibili a tutti gli iscritti a SwimIn.</p>
                        {isAdmin && (
                            <div className="pt-4 border-t border-slate-100">
                                <button onClick={remove} className="text-sm font-semibold text-galleggiante-700 hover:underline flex items-center gap-1.5">
                                    <Icon type="trash" className="w-4 h-4" /> Elimina il gruppo
                                </button>
                            </div>
                        )}
                    </section>
                )}
            </div>

            <EventFormModal open={creatingEvent} groupId={group.$id} onClose={() => setCreatingEvent(false)} onSaved={(e) => navigate(`/eventi/${e.$id}`)} />
            <GroupFormModal open={editing} group={group} onClose={() => setEditing(false)} onSaved={(g) => setGroup(g)} />
        </div>
    );
};

export default GroupPage;
