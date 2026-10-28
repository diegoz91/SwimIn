import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { lazyPage } from '@/utils/lazyPage';
import type { StructureProfile, Job, SquadAnnouncement, SquadShift } from '@/types/types';
import { Icon, type IconType } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { databaseService, type PendingStaffInvite, type ShiftSwap, type TeamMember } from '@/services/database';
import { TeamMembers } from '@/features/team/TeamMembers';
import { useSignal } from '@/hooks/useSignal';
import { ShiftEditModal } from '@/features/team/ShiftEditModal';
import { ShiftCreateModal } from '@/features/team/ShiftCreateModal';
import { ShiftTemplatesModal } from '@/features/team/ShiftTemplatesModal';
import { ShiftExportModal } from '@/features/team/ShiftExportModal';
import { ShiftSwapModal, SwapRequests, type SwapItem } from '@/features/team/ShiftSwap';
import { useToast } from '@/context/ToastContext';
import { CreateJobModal } from '@/features/jobs/components/CreateJobModal';
import { ImageUploadButton } from '@/components/ui/ImageUploadButton';
import { ConnectButton } from '@/components/common/ConnectButton';
import { FollowButton } from '@/components/common/FollowButton';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { StaffChat } from '@/features/team/StaffChat';
import { initialsAvatar } from '@/utils/avatar';
import { isJobOpen, jobDisplayTitle } from '@/utils/jobs';
import { contractLabel, jobRoleLabel } from '@/data/swimming';
import { ProfileEditModal } from './ProfileEditModal';
import { StructureInfo, openStatusOf } from './StructureInfo';
import { ReviewsSection } from '@/features/reviews/ReviewsSection';
import { Stars } from '@/features/reviews/Stars';
import { ratingOf } from '@/utils/profile';
import { Checkbox } from '@/components/form/Field';
import { addDaysISO, formatDate, todayISO, weekStartISO } from '@/utils/dates';
import { ShiftWeek } from './ShiftWeek';
import { StatsDashboard } from '@/features/premium/StatsDashboard';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { isPremium } from '@/utils/premium';
import { useConfirm } from '@/context/ConfirmContext';

// Recharts pesa: lo scarichiamo solo quando si apre la scheda Statistiche.
const ApplicationsChart = lazyPage(() => import('./ApplicationsChart'));

type FacilityTab = 'info' | 'jobs' | 'staff' | 'analytics';
const TAB_SLUG: Record<FacilityTab, string> = { info: 'informazioni', jobs: 'posizioni', staff: 'staff', analytics: 'statistiche' };

interface FacilityViewProps {
    facility: StructureProfile;
    openJobs?: Job[]; 
    onBack: () => void;
    onSelectJob?: (jobId: string) => void;
    onUpdateProfile?: (profile: StructureProfile) => void;
}

export const FacilityView: React.FC<FacilityViewProps> = ({ 
    facility, 
    openJobs = [], 
    onBack, 
    onSelectJob,
    onUpdateProfile
}) => {
    const confirm = useConfirm();
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    
    // Titolare = l'account Struttura stesso; co-amministratori = persone dello staff scelte dal titolare
    // (annunci, candidati, staff, turni). Il profilo della struttura lo modifica solo il titolare.
    const facilityId = facility.$id;
    const isOwner = !!user && user.$id === facilityId;
    const isCoAdmin = !!user && !isOwner && (facility.coAdmins || []).includes(user.$id) && (facility.staff || []).includes(user.$id);
    const isAdmin = isOwner || isCoAdmin;

    // Staff = chi è stato assunto o aggiunto dalla struttura. Un semplice collegamento
    // o un follower non dà accesso all'area staff (lo verifica comunque il server).
    const isStaff = !isAdmin && !!user && (facility.staff || []).includes(user.$id);

    // Visita alla pagina di una struttura: la struttura riceve la notifica, come per le persone.
    useEffect(() => {
        if (user && !isAdmin) databaseService.recordProfileView(facilityId).catch((err) => console.warn('Visita non registrata:', err));
    }, [facilityId, user?.$id, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

    const followersCount = facility.connections?.length || 0;
    const [boardOwner, setBoardOwner] = useState(false);
    
    // Da una notifica della chat staff (?area=chat-staff) si apre direttamente la chat.
    const [params, setParams] = useSearchParams();
    const area = params.get('area');
    const openChat = area === 'chat-staff';
    // ?area=staff (da "Vai all'area staff" dopo un'assunzione) apre l'area staff.
    const openStaff = openChat || area === 'staff';
    // Scheda nell'indirizzo (?scheda=), così il tasto indietro e i link funzionano.
    const tabParam = params.get('scheda');
    const activeTab: FacilityTab = openStaff ? 'staff' : (Object.entries(TAB_SLUG).find(([, slug]) => slug === tabParam)?.[0] as FacilityTab) || 'info';
    const setActiveTab = (t: FacilityTab) => {
        const next = new URLSearchParams(params);
        next.delete('area');
        if (t === 'info') next.delete('scheda');
        else next.set('scheda', TAB_SLUG[t]);
        setParams(next, { replace: true });
    };
    const [staffSubTab, setStaffSubTab] = useState<'bacheca' | 'chat' | 'turni' | 'squadra'>(openChat ? 'chat' : 'bacheca');
    const [invites, setInvites] = useState<PendingStaffInvite[]>([]);
    const [boardVersion, setBoardVersion] = useState(0);
    const [editingShift, setEditingShift] = useState<SquadShift | null>(null);
    // Tempo reale: turni confermati, comunicazioni, staff e inviti si aggiornano senza ricaricare.
    useSignal(isAdmin || isStaff ? `team:${facilityId}` : null, () => setBoardVersion((v) => v + 1));
    const [chatUnread, setChatUnread] = useState(0);
    const staffAreaRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (openStaff) window.setTimeout(() => staffAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }, [openStaff]);

    const [localJobs, setLocalJobs] = useState<Job[]>(openJobs);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const [staff, setStaff] = useState<TeamMember[]>([]);
    const [staffLimit, setStaffLimit] = useState<number | null>(null);
    const [isLoadingStaff, setIsLoadingStaff] = useState(false);
    const [announcements, setAnnouncements] = useState<SquadAnnouncement[]>([]);
    const [shifts, setShifts] = useState<SquadShift[]>([]);
    const [shiftWeek, setShiftWeek] = useState(() => weekStartISO(todayISO()));
    const [newAnnouncement, setNewAnnouncement] = useState('');
    const [isImportant, setIsImportant] = useState(false);
    const [showAddShift, setShowAddShift] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
    const [swapShift, setSwapShift] = useState<SquadShift | null>(null);
    
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    const structureName = facility.structureName;
    const structureType = facility.structureType;
    const city = facility.city;
    const province = facility.province;
    const logo = facility.logo;

    const displayLogo = logo || initialsAvatar(structureName || 'Struttura');
    const coverImage = facility.cover || null;

    /** Salva logo o copertina sul profilo della struttura (solo il titolare). */
    const saveImage = async (field: 'logo' | 'cover', url: string) => {
        const updated = await databaseService.updateProfile(facilityId, { [field]: url });
        if (!updated) throw new Error('Salvataggio non riuscito.');
        if (onUpdateProfile) onUpdateProfile(updated as StructureProfile);
    };


    useEffect(() => {
        setLocalJobs(openJobs);
    }, [openJobs]);


    useEffect(() => {
        if (activeTab !== 'staff' || !(isAdmin || isStaff)) return;
        let alive = true;
        // Aggiornamenti in tempo reale (boardVersion > 0): niente scheletro di caricamento.
        if (boardVersion === 0) setIsLoadingStaff(true);
        databaseService.getTeamBoard(facilityId)
            .then((board) => {
                if (!alive) return;
                setStaff(board.members || []);
                setBoardOwner(!!board.isOwner);
                setStaffLimit(board.staffLimit ?? null);
                setInvites(board.invites || []);
                setAnnouncements(board.announcements || []);
                setShifts(board.shifts || []);
                setSwaps(board.swaps || []);
                setChatUnread(board.chatUnread || 0);
                if (board.role === 'staff' && (board.announcements || []).some((a) => !(a.readBy || []).includes(user?.$id || ''))) {
                    databaseService.markAnnouncementsRead(facilityId).catch((err) => console.error('Bacheca letta:', err));
                }
            })
            .catch((err) => {
                console.error('Area staff:', err);
                if (alive) {
                    showToast(err instanceof Error ? err.message : 'Area staff non disponibile.', 'error');
                    setActiveTab('info');
                }
            })
            .finally(() => alive && setIsLoadingStaff(false));
        return () => { alive = false; };
    }, [activeTab, isAdmin, isStaff, facilityId, user?.$id, showToast, boardVersion]);

    /** Numeri reali della pagina: annunci, candidature ricevute per annuncio, follower. */
    const metrics = useMemo(() => {
        const open = localJobs.filter((j) => isJobOpen(j));
        const candidates = localJobs.reduce((sum, j) => sum + (j.candidates?.length || 0), 0);
        const perJob = localJobs
            .map((j) => ({ name: jobDisplayTitle(j).slice(0, 22) + (jobDisplayTitle(j).length > 22 ? '…' : ''), candidature: j.candidates?.length || 0 }))
            .sort((a, b) => b.candidature - a.candidature)
            .slice(0, 8);
        return { openJobs: open.length, sosJobs: open.filter((j) => j.isSOS).length, candidates, perJob };
    }, [localJobs]);

    const handleJobCreated = async () => {
        const allJobs = await databaseService.getActiveJobs();
        setLocalJobs(allJobs.filter(job => job.structureId === facilityId));
    };

    const handlePostAnnouncement = async () => {
        if (newAnnouncement.trim().length < 2) return showToast('Scrivi la comunicazione.', 'error');
        try {
            const result = await databaseService.createSquadAnnouncement(facilityId, newAnnouncement.trim(), isImportant);
            setAnnouncements([result, ...announcements]);
            setNewAnnouncement(''); setIsImportant(false);
            showToast(isImportant ? 'Comunicazione pubblicata e staff avvisato.' : 'Comunicazione pubblicata.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Pubblicazione non riuscita.', 'error');
        }
    };

    const handleDeleteAnnouncement = async (announcementId: string) => {
        if (!(await confirm({ title: 'Eliminare la comunicazione?', message: 'Sparisce dalla bacheca di tutto lo staff.', confirmLabel: 'Elimina', tone: 'danger' }))) return;
        try {
            await databaseService.deleteSquadAnnouncement(announcementId);
            setAnnouncements((list) => list.filter((a) => a.$id !== announcementId));
            showToast('Comunicazione eliminata.', 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
        }
    };

    const sortShifts = (list: SquadShift[]) => [...list].sort((x, y) => (x.date + x.shiftTime).localeCompare(y.date + y.shiftTime));
    const addShifts = (created: SquadShift[]) => {
        if (!created.length) return;
        setShifts((prev) => sortShifts([...prev.filter((p) => !created.some((c) => c.$id === p.$id)), ...created]));
        setShiftWeek(weekStartISO(created[0].date));
    };

    /** Cambi turno da mostrare: da accettare (per me o aperti a tutti) e i miei in attesa. */
    const swapItems: SwapItem[] = swaps.flatMap((w): SwapItem[] => {
        const shift = shifts.find((x) => x.$id === w.shiftId);
        if (!shift || shift.date < todayISO()) return [];
        const nameOf = (id: string) => { const m = staff.find((x) => x.userId === id); return m ? `${m.firstName} ${m.lastName}`.trim() : 'Un collega'; };
        const when = `${formatDate(shift.date, 'weekday')}, ${shift.shiftTime}`;
        if (w.fromUserId === user?.$id) return [{ id: w.$id, kind: 'mine', title: w.toUserId ? `In attesa di ${nameOf(w.toUserId)}` : 'Offerto a tutto lo staff', detail: when, message: w.message }];
        if (w.toUserId === user?.$id) return [{ id: w.$id, kind: 'incoming', title: `${nameOf(w.fromUserId)} ti chiede di coprire un turno`, detail: when, message: w.message }];
        if (!w.toUserId && isStaff) return [{ id: w.$id, kind: 'open', title: `Turno disponibile: ${nameOf(w.fromUserId)} cerca un sostituto`, detail: when, message: w.message }];
        return [];
    });

    const handleDeleteShift = async (shiftId: string, scope: 'one' | 'series' = 'one') => {
        const target = shifts.find((s) => s.$id === shiftId);
        if (scope === 'series' && !(await confirm({ title: 'Annullare tutta la serie?', message: 'Questo turno e i successivi della stessa serie spariscono; la persona riceve un solo avviso.', confirmLabel: 'Annulla la serie', tone: 'danger' }))) return;
        try {
            const res = await databaseService.deleteSquadShift(shiftId, scope);
            setShifts(shifts.filter((s) => !(s.$id === shiftId || (scope === 'series' && target?.seriesId && s.seriesId === target.seriesId && s.date >= target.date))));
            showToast(res.deleted > 1 ? `${res.deleted} turni annullati.` : 'Turno annullato.', 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    const handleRespondShift = async (shiftId: string, status: 'confirmed' | 'declined') => {
        try {
            const updated = await databaseService.respondShift(shiftId, status);
            setShifts(shifts.map((s) => (s.$id === shiftId ? { ...s, status: updated.status } : s)));
            showToast(status === 'confirmed' ? 'Turno confermato.' : 'Abbiamo avvisato la struttura che non puoi coprirlo.', status === 'confirmed' ? 'success' : 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    const handleRemoveStaff = async (staffId: string) => {
        const leaving = staffId === user?.$id;
        const question = leaving
            ? `Vuoi lasciare lo staff di ${structureName}? Non vedrai più bacheca e turni.`
            : 'Rimuovere questa persona dallo staff? Non vedrà più bacheca e turni, e i suoi turni futuri verranno annullati.';
        if (!(await confirm({ title: leaving ? 'Lasciare lo staff?' : 'Togliere dallo staff?', message: question, confirmLabel: leaving ? 'Lascia lo staff' : 'Togli dallo staff', tone: 'danger' }))) return;
        try {
            await databaseService.removeStaffMember(facilityId, staffId);
            setStaff(staff.filter((s) => s.userId !== staffId));
            onUpdateProfile?.({ ...facility, staff: (facility.staff || []).filter((id) => id !== staffId), coAdmins: (facility.coAdmins || []).filter((id) => id !== staffId) });
            showToast(leaving ? 'Hai lasciato lo staff.' : 'Persona rimossa dallo staff.', 'info');
            if (leaving) setActiveTab('info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };


    const sosJobs = localJobs.filter((j) => j.isSOS && isJobOpen(j));
    const regularJobs = localJobs.filter((j) => !j.isSOS && isJobOpen(j));
    const openPositions = [...sosJobs, ...regularJobs];
    const status = openStatusOf(facility);
    const rating = ratingOf(facility);

    const share = async () => {
        const url = `${window.location.origin}/u/${facilityId}`;
        try {
            if (navigator.share) await navigator.share({ title: `${structureName} su SwimIn`, url });
            else {
                await navigator.clipboard.writeText(url);
                showToast('Link della pagina copiato.', 'success');
            }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') console.error('Condivisione:', err);
        }
    };

    const TABS: { id: FacilityTab; label: string; icon?: IconType; badge?: number; show: boolean }[] = [
        { id: 'info', label: 'Informazioni', show: true },
        { id: 'jobs', label: 'Posizioni aperte', badge: openPositions.length, show: true },
        { id: 'staff', label: isAdmin ? 'Gestione staff' : 'Area staff', icon: 'shield', badge: chatUnread || undefined, show: isAdmin || isStaff },
        { id: 'analytics', label: 'Statistiche', icon: 'chart', show: isOwner },
    ];

    return (
        <div className="max-w-5xl mx-auto w-full pb-8">
            <div className="mb-4 flex items-center justify-between gap-3">
                <button onClick={onBack} className="py-1 -my-1 inline-flex items-center gap-1.5 text-sm font-semibold text-corsia-700 hover:text-corsia-900">
                    <Icon type="arrow-left" className="w-4 h-4" /> Indietro
                </button>
                <button onClick={share} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                    <Icon type="share" className="w-4 h-4" /> Condividi
                </button>
            </div>

            <header className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden">
                <div className="h-36 sm:h-56 relative bg-linear-to-br from-corsia-800 via-corsia-600 to-cloro-500">
                    {coverImage && <img src={coverImage} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    {isOwner && (
                        <ImageUploadButton kind="cover" currentUrl={coverImage} onUploaded={(url) => saveImage('cover', url)} label="Cambia immagine di copertina" className="absolute top-3 right-3 px-3 py-2" />
                    )}
                </div>
                <div className="px-5 sm:px-7 pb-5">
                    <div className="flex flex-wrap items-end justify-between gap-3 -mt-10 sm:-mt-14">
                        <div className="relative shrink-0">
                            <img src={displayLogo} alt="" className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-white shadow-lift bg-white" />
                            {isOwner && <ImageUploadButton kind="avatar" currentUrl={logo} onUploaded={(url) => saveImage('logo', url)} label="Cambia logo" className="absolute -bottom-1 -right-1 w-9 h-9" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-12 sm:pt-0">
                            {isAdmin ? (
                                <>
                                    {isOwner && (
                                        <button onClick={() => setIsEditingProfile(true)} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                            <Icon type="pencil" className="w-4 h-4" /> Modifica pagina
                                        </button>
                                    )}
                                    <Link to={`/jobs/annunci?struttura=${encodeURIComponent(facilityId)}`} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 inline-flex items-center gap-1.5">
                                        <Icon type="briefcase" className="w-4 h-4" /> {isOwner ? 'I miei annunci' : 'Annunci della struttura'}
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => navigate('/messages', { state: { startChatWithUserId: facilityId } })} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-corsia-200 text-corsia-700 hover:border-corsia-400 inline-flex items-center gap-1.5">
                                        <Icon type="chat-bubble" className="w-4 h-4" /> Messaggio
                                    </button>
                                    <ConnectButton profileId={facilityId} />
                                    <FollowButton profileId={facilityId} />
                                </>
                            )}
                        </div>
                    </div>

                    <h1 className="mt-3 text-3xl sm:text-4xl font-bold text-abisso leading-[1.05] flex flex-wrap items-center gap-2">
                        {structureName}
                        {isPremium(facility) && <PremiumBadge size="md" />}
                    </h1>
                    <p className="mt-1 text-slate-600">{[structureType || 'Struttura sportiva', city && `${city}${province ? ` (${province.toUpperCase()})` : ''}`].filter(Boolean).join(' · ')}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        {rating && (
                            <button onClick={() => { setActiveTab('info'); window.setTimeout(() => document.getElementById('reviews-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }} className="py-1 -my-1 inline-flex items-center gap-1.5 text-slate-600 hover:text-abisso">
                                <Stars value={rating.average} />
                                <span className="font-semibold text-abisso">{rating.average.toLocaleString('it-IT', { minimumFractionDigits: 1 })}</span>
                                <span>({rating.count} {rating.count === 1 ? 'recensione' : 'recensioni'})</span>
                            </button>
                        )}
                        {status && <span className={`inline-flex items-center gap-1.5 font-semibold ${status.open ? 'text-cloro-800' : 'text-slate-600'}`}><span className={`w-2 h-2 rounded-full ${status.open ? 'bg-cloro-500' : 'bg-slate-400'}`} aria-hidden="true" />{status.label}</span>}
                        <span className="text-slate-600"><span className="font-semibold text-abisso">{followersCount}</span> {followersCount === 1 ? 'collegamento' : 'collegamenti'}</span>
                        {openPositions.length > 0 && (
                            <button onClick={() => setActiveTab('jobs')} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">
                                {openPositions.length === 1 ? '1 posizione aperta' : `${openPositions.length} posizioni aperte`}
                            </button>
                        )}
                    </div>
                </div>

                <nav className="border-t border-slate-100 px-2 sm:px-4 flex gap-1 overflow-x-auto" aria-label="Sezioni della pagina">
                    {TABS.filter((t) => t.show).map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            aria-current={activeTab === t.id ? 'page' : undefined}
                            className={`shrink-0 px-3 sm:px-4 py-3.5 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5 transition-colors ${activeTab === t.id ? 'border-corsia-600 text-corsia-800' : 'border-transparent text-slate-500 hover:text-abisso'}`}
                        >
                            {t.icon && <Icon type={t.icon} className="w-4 h-4" />}
                            {t.label}
                            {!!t.badge && <span className="tabular-nums text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700">{t.badge}</span>}
                        </button>
                    ))}
                </nav>
            </header>

            <div className="mt-4">
                {activeTab === 'info' && (
                    <StructureInfo
                        facility={facility}
                        isAdmin={isOwner}
                        openJobs={openPositions}
                        onEdit={() => setIsEditingProfile(true)}
                        onShowJobs={() => setActiveTab('jobs')}
                        reviews={
                            <ReviewsSection
                                key={facilityId}
                                structureId={facilityId}
                                structureName={structureName || 'la struttura'}
                                isManager={!!isAdmin}
                                initial={{ ratingSum: (facility as StructureProfile).ratingSum, ratingCount: (facility as StructureProfile).ratingCount }}
                            />
                        }
                    />
                )}

                {activeTab === 'jobs' && (
                    <section className="space-y-4" aria-label="Posizioni aperte">
                        {isAdmin && (
                            <div className="flex flex-wrap justify-end gap-2">
                                <Link to={`/jobs/annunci?struttura=${encodeURIComponent(facilityId)}`} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                    <Icon type="briefcase" className="w-4 h-4" /> Annunci e candidati
                                </Link>
                                <button onClick={() => setIsCreateModalOpen(true)} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 inline-flex items-center gap-1.5">
                                    <Icon type="plus" className="w-4 h-4" /> Pubblica annuncio
                                </button>
                            </div>
                        )}
                        {openPositions.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-10 text-center">
                                <Icon type="briefcase" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                                <h2 className="text-xl font-semibold text-abisso">Nessuna posizione aperta</h2>
                                <p className="text-slate-500 mt-1">{isAdmin ? 'Pubblica un annuncio: chi ha un avviso di lavoro adatto riceve subito una notifica.' : 'In questo momento la struttura non cerca personale. Seguila per sapere quando pubblica.'}</p>
                            </div>
                        ) : (
                            <ul className="space-y-3">
                                {openPositions.map((job) => (
                                    <li key={job.$id} className={`bg-white rounded-2xl border shadow-card p-5 ${job.isSOS ? 'border-red-200' : 'border-slate-200'}`}>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                {job.isSOS && <p className="text-xs font-semibold text-galleggiante-700">Sostituzione urgente · {formatDate(job.sosDate, 'weekday')}{job.sosShift ? `, ${job.sosShift}` : ''}</p>}
                                                <h3 className="text-lg font-semibold text-abisso leading-snug">
                                                    <Link to={`/jobs/${job.$id}`} className="hover:underline">{jobDisplayTitle(job)}</Link>
                                                </h3>
                                                <p className="text-sm text-slate-500">{[job.role && jobRoleLabel(job.role), job.contractType && contractLabel(job.contractType), job.city].filter(Boolean).join(' · ')}</p>
                                            </div>
                                            <button onClick={() => onSelectJob?.(job.$id)} className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold bg-corsia-50 text-corsia-800 hover:bg-corsia-100">
                                                {isAdmin ? 'Candidati e dettagli' : 'Dettagli e candidatura'}
                                            </button>
                                        </div>
                                        {job.description && <p className="mt-2 text-sm text-slate-600 line-clamp-2">{job.description}</p>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}

                {/* 3. GESTIONE TEAM (Admin & Staff) */}
                {activeTab === 'staff' && (isAdmin || isStaff) && (
                    <div ref={staffAreaRef} className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden scroll-mt-20">
                        
                        <div className="border-b border-slate-100 px-3 sm:px-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Area staff">
                            {([
                                { id: 'bacheca', label: 'Bacheca' },
                                { id: 'chat', label: 'Chat staff', badge: staffSubTab !== 'chat' ? chatUnread : 0 },
                                { id: 'turni', label: 'Turni' },
                                { id: 'squadra', label: 'Squadra', badge: isAdmin ? invites.length : 0 },
                            ] as const).map((t) => (
                                <button
                                    key={t.id}
                                    role="tab"
                                    aria-selected={staffSubTab === t.id}
                                    onClick={() => setStaffSubTab(t.id)}
                                    className={`shrink-0 px-3 py-3 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5 ${staffSubTab === t.id ? 'border-corsia-600 text-corsia-800' : 'border-transparent text-slate-500 hover:text-abisso'}`}
                                >
                                    {t.label}
                                    {'badge' in t && t.badge > 0 && <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-corsia-600 text-white text-xs grid place-items-center tabular-nums">{t.badge > 99 ? '99+' : t.badge}</span>}
                                </button>
                            ))}
                        </div>

                        {staffSubTab === 'bacheca' && (
                            <div className="p-6 animate-in fade-in">
                                {isAdmin && (
                                    <div className="mb-6 bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
                                        <textarea 
                                            placeholder="Scrivi una comunicazione ufficiale per tutto il tuo team..." 
                                            className="w-full bg-white border border-slate-200 rounded-xl p-4 outline-hidden focus:ring-2 focus:ring-blue-500 transition-shadow resize-none text-[15px]" 
                                            rows={3} value={newAnnouncement} onChange={e=>setNewAnnouncement(e.target.value)}
                                        />
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 gap-4">
                                            <Checkbox id="ann-important" tone="danger" checked={isImportant} onChange={setIsImportant} label="Segna come importante" description="Compare in evidenza nella bacheca dello staff." />
                                            <button onClick={handlePostAnnouncement} className="w-full sm:w-auto bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-xs flex items-center justify-center gap-2 active:scale-95">
                                                <Icon type="send" className="w-4 h-4"/> Pubblica
                                            </button>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="space-y-4">
                                    {announcements.map(ann => (
                                        <div key={ann.$id} className={`p-5 rounded-2xl border transition-all ${ann.isImportant ? 'bg-red-50/50 border-red-200 shadow-xs' : 'bg-white border-slate-200'}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${ann.isImportant ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                                    {ann.isImportant ? 'Importante' : 'Comunicazione'}
                                                </span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                                                        <Icon type="clock" className="w-3.5 h-3.5"/> 
                                                        {new Date(ann.$createdAt || Date.now()).toLocaleDateString('it-IT')}
                                                    </span>
                                                    {isAdmin && (
                                                        <button onClick={() => void handleDeleteAnnouncement(ann.$id)} aria-label="Elimina la comunicazione" className="text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 transition-colors p-1.5 rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-red-400" title="Elimina">
                                                            <Icon type="trash" className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-slate-800 font-medium mb-4 leading-relaxed text-[15px] whitespace-pre-wrap">{ann.content}</p>
                                            
                                            {isAdmin && (
                                                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                                                    <span className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                                                        <div className="bg-blue-100 p-1 rounded-full"><Icon type="check-double" className="w-3 h-3 text-blue-600"/></div>
                                                        Letti: <span className="text-slate-700">{(ann.readBy || []).length} / {staff.length || 1}</span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {announcements.length === 0 && (
                                        <div className="text-center py-10 px-4">
                                            <div className="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-200">
                                                <Icon type="chat-bubble" className="w-6 h-6 text-slate-400" />
                                            </div>
                                            <p className="text-slate-500 font-bold">Nessun annuncio presente</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {staffSubTab === 'turni' && (
                            <div className="p-6 animate-in fade-in">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-lg">Turni</h3>
                                        <p className="text-sm text-slate-500 font-medium">{isAdmin ? 'Assegna i turni allo staff: ognuno riceve un avviso e può confermare.' : 'I turni della squadra. Conferma i tuoi o segnala se non puoi coprirli.'}</p>
                                    </div>
                                    {isAdmin && (
                                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                            <button onClick={() => setShowTemplates(true)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-slate-300 text-abisso text-sm font-semibold hover:bg-slate-50">
                                                <Icon type="calendar" className="w-4 h-4" /> Modelli
                                            </button>
                                            <button onClick={() => setShowExport(true)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-slate-300 text-abisso text-sm font-semibold hover:bg-slate-50">
                                                <Icon type="document" className="w-4 h-4" /> Esporta
                                            </button>
                                            <button onClick={() => setShowAddShift(true)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-corsia-600 text-white text-sm font-semibold hover:bg-corsia-700">
                                                <Icon type="plus" className="w-4 h-4" /> Assegna turni
                                            </button>
                                        </div>
                                    )}
                                </div>
                                
                                <SwapRequests items={swapItems} onChanged={() => setBoardVersion((v) => v + 1)} />

                                <ShiftWeek
                                    shifts={shifts}
                                    weekStart={shiftWeek}
                                    onWeekChange={setShiftWeek}
                                    currentUserId={user?.$id}
                                    show="person"
                                    actions={(shift) => (
                                        <>
                                            {shift.userId === user?.$id && shift.date >= todayISO() && shift.status !== 'confirmed' && (
                                                <button onClick={() => handleRespondShift(shift.$id, 'confirmed')} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-corsia-600 text-white hover:bg-corsia-700">Confermo</button>
                                            )}
                                            {shift.userId === user?.$id && shift.date >= todayISO() && shift.status !== 'declined' && (
                                                <button onClick={() => handleRespondShift(shift.$id, 'declined')} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">Non posso</button>
                                            )}
                                            {isAdmin && shift.date >= todayISO() && (
                                                <button onClick={() => setEditingShift(shift)} className="text-xs font-semibold px-2.5 py-1 rounded-full text-corsia-700 hover:bg-corsia-50" aria-label={`Modifica il turno di ${shift.userName} del ${shift.date}`}>
                                                    Modifica
                                                </button>
                                            )}
                                            {shift.userId === user?.$id && shift.date >= todayISO() && !swaps.some((w) => w.shiftId === shift.$id) && (
                                                <button onClick={() => setSwapShift(shift)} className="text-xs font-semibold px-2.5 py-1 rounded-full text-corsia-700 hover:bg-corsia-50" aria-label={`Cedi o scambia il turno del ${shift.date}`}>
                                                    Cedi
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button onClick={() => handleDeleteShift(shift.$id)} className="text-xs font-semibold px-2.5 py-1 rounded-full text-slate-500 hover:text-red-700 hover:bg-red-50" aria-label={`Annulla il turno di ${shift.userName} del ${shift.date}`}>
                                                    Annulla
                                                </button>
                                            )}
                                            {isAdmin && shift.seriesId && shift.date >= todayISO() && (
                                                <button onClick={() => handleDeleteShift(shift.$id, 'series')} className="text-xs font-semibold px-2.5 py-1 rounded-full text-slate-500 hover:text-red-700 hover:bg-red-50" aria-label={`Annulla la serie di turni di ${shift.userName} dal ${shift.date}`}>
                                                    Annulla serie
                                                </button>
                                            )}
                                        </>
                                    )}
                                />
                                {isStaff && (
                                    <p className="mt-3 text-sm text-slate-500">
                                        Tutti i tuoi turni, anche di altre strutture, sono in <Link to="/turni" className="font-semibold text-corsia-700 hover:underline">I miei turni</Link>, da cui puoi aggiungerli al calendario.
                                    </p>
                                )}
                            </div>
                        )}

                        {staffSubTab === 'chat' && user && (
                            <StaffChat structureId={facilityId} structureName={structureName || 'Struttura'} currentUserId={user.$id} isAdmin={isAdmin} onRead={() => setChatUnread(0)} />
                        )}

                        {(isStaff || isCoAdmin) && user && (
                            <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                                <span>{isCoAdmin ? `Sei co-amministratore di ${structureName}.` : `Fai parte dello staff di ${structureName}.`}</span>
                                <button onClick={() => handleRemoveStaff(user.$id)} className="py-1 -my-1 font-semibold text-slate-600 hover:text-galleggiante-700">Lascia lo staff</button>
                            </div>
                        )}

                        {staffSubTab === 'squadra' && (
                            <TeamMembers
                                structureId={facilityId}
                                structureName={structureName || 'la struttura'}
                                isAdmin={!!isAdmin}
                                isOwner={isOwner && boardOwner}
                                currentUserId={user?.$id}
                                members={staff}
                                invites={invites}
                                staffLimit={staffLimit}
                                loading={isLoadingStaff}
                                onRemove={handleRemoveStaff}
                                onChanged={() => setBoardVersion((v) => v + 1)}
                            />
                        )}
                    </div>
                )}

                {/* 4. STATISTICHE (solo amministratori): solo dati reali */}
                {activeTab === 'analytics' && isOwner && <div className="mb-6"><StatsDashboard premium={isPremium(facility)} showViewers={false} /></div>}
                {activeTab === 'analytics' && isOwner && (
                    <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden p-6 animate-in fade-in duration-300">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-abisso">Statistiche</h2>
                            <p className="text-sm text-slate-500 mt-1">Annunci pubblicati da questa pagina e candidature ricevute.</p>
                        </div>
                        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                            {[
                                { label: 'Annunci aperti', value: metrics.openJobs },
                                { label: 'SOS in corso', value: metrics.sosJobs },
                                { label: 'Candidature ricevute', value: metrics.candidates },
                                { label: 'Collegamenti', value: followersCount },
                            ].map((m) => (
                                <div key={m.label} className="rounded-2xl bg-piastrella px-4 py-3">
                                    <dt className="text-xs text-slate-500">{m.label}</dt>
                                    <dd className="font-display text-3xl font-bold text-abisso">{m.value}</dd>
                                </div>
                            ))}
                        </dl>
                        <h3 className="text-sm font-semibold text-abisso mb-3">Candidature per annuncio</h3>
                        {metrics.perJob.some((j) => j.candidature > 0) ? (
                            <div className="h-72 w-full">
                                <Suspense fallback={<div className="h-full w-full bg-slate-50 rounded-xl animate-pulse" />}>
                                    <ApplicationsChart data={metrics.perJob} />
                                </Suspense>
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-6 text-center">Le candidature ai tuoi annunci compariranno qui.</p>
                        )}
                    </div>
                )}
            </div>

            {isAdmin && <ShiftCreateModal open={showAddShift} structureId={facilityId} staff={staff} defaultDate={shiftWeek > todayISO() ? shiftWeek : undefined} onClose={() => setShowAddShift(false)} onCreated={addShifts} />}
            {isAdmin && (
                <ShiftTemplatesModal
                    open={showTemplates}
                    structureId={facilityId}
                    weekStart={shiftWeek}
                    weekShifts={shifts.filter((x) => x.date >= shiftWeek && x.date <= addDaysISO(shiftWeek, 6))}
                    staff={staff}
                    onClose={() => setShowTemplates(false)}
                    onApplied={addShifts}
                />
            )}
            {isAdmin && <ShiftExportModal open={showExport} structureId={facilityId} defaultMonth={shiftWeek.slice(0, 7)} onClose={() => setShowExport(false)} />}
            {user && <ShiftSwapModal shift={swapShift} colleagues={staff} currentUserId={user.$id} onClose={() => setSwapShift(null)} onSent={() => setBoardVersion((v) => v + 1)} />}
            {isAdmin && (
            <ShiftEditModal
                    shift={editingShift}
                    staff={staff}
                    onClose={() => setEditingShift(null)}
                    onSaved={(saved) => {
                        setShifts((list) => list.map((x) => (x.$id === saved.$id ? saved : x)).sort((x, y) => (x.date + x.shiftTime).localeCompare(y.date + y.shiftTime)));
                        setShiftWeek(weekStartISO(saved.date));
                    }}
                />
            )}
            {isOwner && (
                <ProfileEditModal open={isEditingProfile} profile={facility} onClose={() => setIsEditingProfile(false)} onSaved={(p) => onUpdateProfile?.(p as StructureProfile)} />
            )}

            {/* MODAL CREA ANNUNCIO LAVORO */}
            {isAdmin && user && (
                <CreateJobModal 
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onJobCreated={handleJobCreated}
                    structureId={facilityId}
                />
            )}
        </div>
    );
};