import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { StructureProfile, Job, UserProfile, Certification, SquadAnnouncement, SquadShift, Facility } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { CreateJobModal } from '@/features/jobs/components/CreateJobModal';
import { ImageUploadButton } from '@/components/ui/ImageUploadButton';
import { ConnectButton } from '@/components/common/ConnectButton';
import { useNavigate } from 'react-router-dom';
import { initialsAvatar } from '@/utils/avatar';
import { isJobOpen, jobDisplayTitle } from '@/utils/jobs';
import { ProfileEditModal } from './ProfileEditModal';
import { FacilityFormModal, type FacilityFormValues } from './FacilityFormModal';
import { PoolSection } from './PoolSection';
import { provinceName } from '@/data/italy';
import { Field } from '@/components/form/Field';
import { addDaysISO, formatDate, todayISO } from '@/utils/dates';

interface FacilityViewProps {
    facility: StructureProfile | Facility;
    openJobs?: Job[]; 
    onBack: () => void;
    onSelectJob?: (jobId: string) => void;
    onUpdateProfile?: (profile: StructureProfile | Facility) => void;
}

export const FacilityView: React.FC<FacilityViewProps> = ({ 
    facility, 
    openJobs = [], 
    onBack, 
    onSelectJob,
    onUpdateProfile
}) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    
    // 💡 LOGICA DI RICONOSCIMENTO ADMIN E STAFF (MODELLO LINKEDIN)
    const isLegacyStructure = 'userType' in facility && facility.userType === 'structure';
    const facilityId = facility.$id || (facility as any).userId;
    
    const isAdmin = isLegacyStructure 
        ? user?.$id === facilityId
        : (facility as Facility).admins?.includes(user?.$id || '');
        
    const isStaff = isLegacyStructure
        ? (facility as StructureProfile).connections?.includes(user?.$id || '')
        : (facility as Facility).staff?.includes(user?.$id || '');
    
    // 💡 STATI PER I FOLLOWERS
    const [isFollowing, setIsFollowing] = useState(false);
    const [followersCount, setFollowersCount] = useState(0);
    
    const [activeTab, setActiveTab] = useState<'info' | 'jobs' | 'staff' | 'analytics'>('info');
    const [staffSubTab, setStaffSubTab] = useState<'bacheca' | 'turni' | 'radar'>('bacheca');

    const [localJobs, setLocalJobs] = useState<Job[]>(openJobs);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const [staff, setStaff] = useState<UserProfile[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(false);
    const [announcements, setAnnouncements] = useState<SquadAnnouncement[]>([]);
    const [shifts, setShifts] = useState<SquadShift[]>([]);
    const [newAnnouncement, setNewAnnouncement] = useState('');
    const [isImportant, setIsImportant] = useState(false);
    const [showAddShift, setShowAddShift] = useState(false);
    const [newShift, setNewShift] = useState({ userId: '', userName: '', date: '', start: '', end: '', role: '' });
    const [shiftErrors, setShiftErrors] = useState<Partial<Record<'userId' | 'date' | 'start' | 'end', string>>>({});
    
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null);

    const structureName = isLegacyStructure ? (facility as StructureProfile).structureName : (facility as Facility).name;
    const structureType = isLegacyStructure ? (facility as StructureProfile).structureType : (facility as Facility).type;
    const city = facility.city;
    const province = facility.province;
    const bio = facility.bio;
    const logo = facility.logo;

    const displayLogo = logo || initialsAvatar(structureName || 'Struttura');
    const coverImage = (facility as Facility | StructureProfile).cover || null;

    /** Salva logo o copertina sulla pagina (Facility) o sul profilo Struttura. */
    const saveImage = async (field: 'logo' | 'cover', url: string) => {
        const updated = isLegacyStructure
            ? await databaseService.updateProfile(facilityId, { [field]: url })
            : await databaseService.updateFacility(facilityId, { [field]: url });
        if (!updated) throw new Error('Salvataggio non riuscito.');
        if (onUpdateProfile) onUpdateProfile(updated as StructureProfile | Facility);
    };


    useEffect(() => {
        setLocalJobs(openJobs);
    }, [openJobs]);


    // 💡 INIZIALIZZAZIONE FOLLOWERS ALL'AVVIO
    useEffect(() => {
        if (!isLegacyStructure) {
            const fac = facility as Facility;
            setFollowersCount(fac.followers?.length || 0);
            setIsFollowing(fac.followers?.includes(user?.$id || '') || false);
        } else {
            // Se è la vecchia struttura (Fase 1), calcoliamo le amicizie standard
            setFollowersCount((facility as StructureProfile).connections?.length || 0);
        }
    }, [facility, user, isLegacyStructure]);

    useEffect(() => {
        if (activeTab === 'staff' && (isAdmin || isStaff)) {
            const loadStaffData = async () => {
                setIsLoadingStaff(true);
                try {
                    const memberIds = isLegacyStructure ? (facility as StructureProfile).connections : (facility as Facility).staff;
                    
                    if (memberIds && memberIds.length > 0) {
                        const profiles = await Promise.all(
                            memberIds.map(id => databaseService.getProfile(id).catch(() => null))
                        );
                        setStaff(profiles.filter(p => p && p.userType === 'professional') as UserProfile[]);
                    } else {
                        setStaff([]);
                    }

                    const dbAnnouncements = await databaseService.getSquadAnnouncements(facilityId);
                    setAnnouncements(dbAnnouncements);

                    const dbShifts = await databaseService.getSquadShifts(facilityId);
                    setShifts(dbShifts);

                } finally {
                    setIsLoadingStaff(false);
                }
            };
            loadStaffData();
        }
    }, [activeTab, isAdmin, isStaff, facilityId, facility, isLegacyStructure]);

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

    // 💡 LOGICA AZIONE "SEGUI PAGINA"
    const handleToggleFollow = async () => {
        if (!user || isLegacyStructure) return; // Non supportato sulle legacy (non ci serve)
        const isNowFollowing = await databaseService.toggleFollowFacility(facilityId, user.$id);
        if (isNowFollowing !== null) {
            setIsFollowing(isNowFollowing);
            setFollowersCount(prev => isNowFollowing ? prev + 1 : prev - 1);
            showToast(isNowFollowing ? 'Pagina Seguita!' : 'Non segui più questa pagina', 'info');
        }
    };

    const handleSaveFacility = async (values: FacilityFormValues) => {
        const updated = await databaseService.updateFacility(facilityId, values);
        if (!updated) {
            showToast('Non è stato possibile salvare le modifiche.', 'error');
            throw new Error('updateFacility');
        }
        onUpdateProfile?.(updated as Facility);
        showToast('Pagina aggiornata.', 'success');
    };

    const handleJobCreated = async () => {
        const allJobs = await databaseService.getActiveJobs();
        setLocalJobs(allJobs.filter(job => job.structureId === facilityId));
    };

    const handlePostAnnouncement = async () => {
        if (!newAnnouncement.trim()) return;
        const result = await databaseService.createSquadAnnouncement({
            structureId: facilityId, content: newAnnouncement, isImportant, readBy: []
        });
        if (result) {
            setAnnouncements([result, ...announcements]);
            setNewAnnouncement(''); setIsImportant(false);
            showToast('Comunicazione pubblicata.', 'success');
        }
    };

    const handleConfirmDeleteAnnouncement = async () => {
        if (!announcementToDelete) return;
        const success = await databaseService.deleteSquadAnnouncement(announcementToDelete);
        if (success) {
            setAnnouncements(announcements.filter(a => (a.$id || (a as any).id) !== announcementToDelete));
            showToast('Comunicazione eliminata.', 'info');
        }
        setAnnouncementToDelete(null); 
    };

    const handleConfirmShift = async () => {
        const today = todayISO();
        const errors: typeof shiftErrors = {};
        if (!newShift.userId) errors.userId = 'Scegli chi coprirà il turno.';
        if (!newShift.date) errors.date = 'Indica la data.';
        else if (newShift.date < today) errors.date = 'La data è già passata.';
        else if (newShift.date > addDaysISO(today, 180)) errors.date = 'Massimo 6 mesi in anticipo.';
        if (!newShift.start) errors.start = 'Indica l’inizio.';
        if (!newShift.end) errors.end = 'Indica la fine.';
        else if (newShift.start && newShift.end <= newShift.start) errors.end = 'La fine deve essere dopo l’inizio.';
        setShiftErrors(errors);
        if (Object.keys(errors).length) return;
        const { start, end, ...rest } = newShift;
        const result = await databaseService.createSquadShift({
            structureId: facilityId, ...rest, shiftTime: `${start}–${end}`, status: 'scheduled'
        });
        if(result) {
            setShifts([...shifts, result]);
            setShowAddShift(false);
            setNewShift({ userId: '', userName: '', date: '', start: '', end: '', role: '' });
            showToast('Turno assegnato.', 'success');
        } else {
            showToast('Non è stato possibile salvare il turno.', 'error');
        }
    };

    const handleDeleteShift = async (shiftId: string) => {
        await databaseService.deleteSquadShift(shiftId);
        setShifts(shifts.filter(s => s.$id !== shiftId));
        showToast('Turno rimosso', 'info');
    };

    const handleRemoveStaff = async (staffId: string) => {
        if (window.confirm("Sei sicuro di voler rimuovere questo membro dal tuo Team? Non potrà più visualizzare la bacheca aziendale o i turni.")) {
            const success = await databaseService.removeStaffMember(facilityId, staffId);
            if (success) {
                setStaff(staff.filter(s => (s.userId || s.$id) !== staffId));
                showToast("Membro rimosso dallo staff.", "info");
                
                if (onUpdateProfile) {
                    if (isLegacyStructure) {
                        const prof = facility as StructureProfile;
                        onUpdateProfile({ ...prof, connections: (prof.connections || []).filter(id => id !== staffId) });
                    } else {
                        const fac = facility as Facility;
                        onUpdateProfile({ ...fac, staff: (fac.staff || []).filter(id => id !== staffId) });
                    }
                }
            } else {
                showToast("Errore durante la rimozione.", "error");
            }
        }
    };

    const isCertExpiringOrExpired = (dateString?: string) => {
        if (!dateString) return false;
        const diffDays = Math.ceil((new Date(dateString).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        return diffDays <= 30; 
    };

    const sosJobs = localJobs.filter(j => j.isSOS && isJobOpen(j));
    const regularJobs = localJobs.filter(j => !j.isSOS && j.isActive);

    return (
        <div className="max-w-5xl mx-auto w-full pb-8 animate-in fade-in duration-500">
            <button 
                onClick={onBack} 
                className="mb-4 text-blue-600 font-semibold hover:underline flex items-center gap-2 group transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
            >
                <Icon type="arrow-left" className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> 
                Torna indietro
            </button>
            
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                <div className="h-48 sm:h-64 relative bg-gradient-to-br from-blue-700 via-sky-600 to-cyan-500">
                    {coverImage && <img src={coverImage} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    {isAdmin && (
                        <ImageUploadButton
                            kind="cover"
                            currentUrl={coverImage}
                            onUploaded={(url) => saveImage('cover', url)}
                            label="Cambia immagine di copertina"
                            className="absolute top-3 right-3 px-3 py-2"
                        />
                    )}
                </div>
                <div className="px-6 pb-6 relative">
                    <div className="flex justify-between items-end -mt-12 sm:-mt-16 mb-4">
                        <div className="relative">
                            <img src={displayLogo} alt={structureName} className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl object-cover border-4 border-white shadow-lg bg-white" />
                            {isAdmin && (
                                <ImageUploadButton
                                    kind="avatar"
                                    currentUrl={logo}
                                    onUploaded={(url) => saveImage('logo', url)}
                                    label="Cambia logo"
                                    className="absolute -bottom-1 -right-1 w-9 h-9"
                                />
                            )}
                        </div>
                        
                        {/* 💡 PULSANTE "SEGUI PAGINA" FUNZIONANTE */}
                        {!isAdmin && !isLegacyStructure && (
                            <button 
                                onClick={handleToggleFollow}
                                className={`font-bold py-2.5 px-6 rounded-full transition shadow-sm active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 flex items-center gap-2 ${isFollowing ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-500' : 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500'}`}
                            >
                                {isFollowing ? <><Icon type="check-double" className="w-4 h-4"/> Segui già</> : <><Icon type="plus" className="w-4 h-4"/> Segui</>}
                            </button>
                        )}

                        {/* Fallback per Profili Struttura Legacy Phase 1 */}
                        {!isAdmin && isLegacyStructure && (
                            <div className="flex items-center gap-2">
                                <button onClick={() => navigate('/messages', { state: { startChatWithUserId: facilityId } })} className="py-2.5 px-5 rounded-full font-semibold bg-white border border-corsia-200 text-corsia-700 hover:border-corsia-400 flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500">
                                    <Icon type="chat-bubble" className="w-4 h-4" /> Messaggio
                                </button>
                                <ConnectButton profileId={facilityId} />
                            </div>
                        )}
                    </div>
                    
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{structureName}</h1>
                            {('isOnline' in facility) && facility.isOnline && (
                                <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-1 rounded-full text-xs font-bold shadow-sm border border-green-200 animate-in zoom-in" title="Struttura attualmente online">
                                    <span className="relative flex h-2.5 w-2.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                    </span>
                                    Online
                                </span>
                            )}
                        </div>
                        <p className="text-lg text-slate-600 font-medium mt-1">{structureType || 'Centro Sportivo'}</p>
                        
                        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm font-semibold text-slate-500">
                            <span className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                <Icon type="location" className="w-4 h-4 text-slate-400" />
                                {city}{province ? `, ${provinceName(province) || province}` : ''}
                            </span>
                            {facility.phone && (
                                <a href={`tel:${facility.phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 text-corsia-700 hover:underline">
                                    <Icon type="phone" className="w-4 h-4" /> {facility.phone}
                                </a>
                            )}
                            {facility.website && (
                                <a href={facility.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 text-corsia-700 hover:underline">
                                    <Icon type="globe" className="w-4 h-4" /> {facility.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                                </a>
                            )}
                            <span className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 text-blue-700">
                                <Icon type="users" className="w-4 h-4" />
                                {/* 💡 Stampa il counter dei veri Followers */}
                                {followersCount} {isLegacyStructure ? 'Collegamenti' : 'Followers'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="border-t border-slate-100 bg-slate-50 flex overflow-x-auto hide-scrollbar-mobile">
                    <button onClick={() => setActiveTab('info')} className={`px-6 py-4 font-bold text-sm outline-none transition-colors border-b-2 ${activeTab === 'info' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
                        Informazioni
                    </button>
                    <button onClick={() => setActiveTab('jobs')} className={`px-6 py-4 font-bold text-sm outline-none transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'jobs' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
                        Posizioni aperte <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">{localJobs.filter(j => j.isActive).length}</span>
                    </button>
                    {/* 💡 ACCESSO AREA TEAM PER ADMIN E STAFF! */}
                    {(isAdmin || isStaff) && (
                        <button onClick={() => setActiveTab('staff')} className={`px-6 py-4 font-bold text-sm outline-none transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'staff' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
                            <Icon type="shield" className="w-4 h-4" /> {isAdmin ? 'Gestione staff' : 'Area staff'}
                        </button>
                    )}
                    {isAdmin && (
                        <button onClick={() => setActiveTab('analytics')} className={`px-6 py-4 font-bold text-sm outline-none transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'analytics' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
                            <Icon type="star" className="w-4 h-4" /> Statistiche
                        </button>
                    )}
                </div>
            </div>

            <div className="animate-in fade-in duration-300">
                
                {/* 1. INFO TAB */}
                {activeTab === 'info' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 relative">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Icon type="info" className="w-5 h-5 text-blue-600" />
                                Chi siamo
                            </h2>
                            {isAdmin && (
                                <button onClick={() => setIsEditingProfile(true)} className="text-sm font-semibold text-corsia-700 bg-corsia-50 px-4 py-2 rounded-full hover:bg-corsia-100 transition-colors flex items-center gap-2">
                                    <Icon type="edit" className="w-4 h-4" /> Modifica
                                </button>
                            )}
                        </div>
                        <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                            {bio || (isAdmin ? 'Aggiungi una presentazione: vasche, servizi, ambiente di lavoro.' : 'La struttura non ha ancora inserito una presentazione.')}
                        </p>
                    </div>
                )}
                {activeTab === 'info' && isLegacyStructure && (
                    <div className="mt-6">
                        <PoolSection profile={facility as StructureProfile} isOwnProfile={isAdmin} onEdit={() => setIsEditingProfile(true)} />
                    </div>
                )}

                {/* 2. JOBS TAB */}
                {activeTab === 'jobs' && (
                    <div className="space-y-4">
                        
                        {isAdmin && (
                            <div className="flex justify-end mb-4">
                                <button 
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    <Icon type="plus" className="w-5 h-5" /> Pubblica annuncio
                                </button>
                            </div>
                        )}

                        {sosJobs.length > 0 && (
                            <div className="mb-6 space-y-4">
                                <h3 className="font-extrabold text-red-600 flex items-center gap-2 mb-2 px-2">
                                    <Icon type="alert-triangle" className="w-5 h-5 animate-pulse" /> Sostituzioni urgenti
                                </h3>
                                {sosJobs.map(job => (
                                    <div key={job.$id} className="bg-red-50 border-2 border-red-500 p-5 rounded-2xl shadow-[0_0_15px_rgba(239,68,68,0.2)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">SOS ATTIVO</div>
                                        <div className="pt-2 sm:pt-0 pr-20 sm:pr-0">
                                            <h3 className="font-bold text-lg text-red-800">{jobDisplayTitle(job)}</h3>
                                            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-red-700 font-medium">
                                                <span className="flex items-center gap-1"><Icon type="calendar" className="w-3.5 h-3.5" /> {formatDate(job.sosDate, 'weekday')}</span>
                                                <span className="flex items-center gap-1"><Icon type="clock" className="w-3.5 h-3.5" /> {job.sosShift}</span>
                                                <span className="flex items-center gap-1 bg-white/60 px-2 py-0.5 rounded border border-red-200">€{job.salaryMin} netti</span>
                                            </div>
                                        </div>
                                        <button onClick={() => onSelectJob && onSelectJob(job.$id)} className="w-full sm:w-auto bg-red-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-red-700 transition-all outline-none focus-visible:ring-2 focus-visible:ring-red-500 shadow-md">Vedi dettagli</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {regularJobs.length > 0 ? (
                            regularJobs.map(job => (
                                <div key={job.$id} className="bg-white border border-slate-200 p-5 rounded-2xl hover:shadow-md transition-shadow group">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-600 transition-colors">{jobDisplayTitle(job)}</h3>
                                            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500 font-medium">
                                                <span className="flex items-center gap-1"><Icon type="user" className="w-3.5 h-3.5" /> {job.role}</span>
                                                <span className="flex items-center gap-1"><Icon type="clock" className="w-3.5 h-3.5" /> {job.contractType}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => onSelectJob && onSelectJob(job.$id)} className="w-full sm:w-auto bg-blue-50 text-blue-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-600 hover:text-white transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Vedi dettagli</button>
                                    </div>
                                    {job.description && <p className="text-slate-600 mt-3 text-sm line-clamp-2 leading-relaxed">{job.description}</p>}
                                </div>
                            ))
                        ) : (
                            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
                                <Icon type="search" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-600 font-bold text-lg">Nessuna posizione aperta</p>
                                {isAdmin ? (
                                    <p className="text-sm text-slate-500 mt-1">Usa il tasto in alto per pubblicare il tuo primo annuncio!</p>
                                ) : (
                                    <p className="text-sm text-slate-500 mt-1">Questa pagina non sta cercando personale al momento.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 3. GESTIONE TEAM (Admin & Staff) */}
                {activeTab === 'staff' && (isAdmin || isStaff) && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        
                        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
                            <div className="flex space-x-3 overflow-x-auto hide-scrollbar-mobile pb-1">
                                <button onClick={() => setStaffSubTab('bacheca')} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${staffSubTab === 'bacheca' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                                    Bacheca Ufficiale
                                </button>
                                <button onClick={() => setStaffSubTab('turni')} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${staffSubTab === 'turni' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                                    Gestione Turni
                                </button>
                                {isAdmin && (
                                    <button onClick={() => setStaffSubTab('radar')} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${staffSubTab === 'radar' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                                        <Icon type="shield" className="w-4 h-4"/> Radar Scadenze
                                    </button>
                                )}
                            </div>
                        </div>

                        {staffSubTab === 'bacheca' && (
                            <div className="p-6 animate-in fade-in">
                                {isAdmin && (
                                    <div className="mb-6 bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
                                        <textarea 
                                            placeholder="Scrivi una comunicazione ufficiale per tutto il tuo team..." 
                                            className="w-full bg-white border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none text-[15px]" 
                                            rows={3} value={newAnnouncement} onChange={e=>setNewAnnouncement(e.target.value)}
                                        />
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 gap-4">
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer group">
                                                <input type="checkbox" checked={isImportant} onChange={e=>setIsImportant(e.target.checked)} className="w-4 h-4 text-red-600 focus:ring-red-500 border-slate-300 rounded cursor-pointer" />
                                                <Icon type="alert-triangle" className={`w-4 h-4 transition-colors ${isImportant ? 'text-red-500' : 'text-slate-400 group-hover:text-red-400'}`}/> 
                                                Segna come Importante
                                            </label>
                                            <button onClick={handlePostAnnouncement} className="w-full sm:w-auto bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-sm flex items-center justify-center gap-2 active:scale-95">
                                                <Icon type="send" className="w-4 h-4"/> Pubblica
                                            </button>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="space-y-4">
                                    {announcements.map(ann => (
                                        <div key={ann.$id || (ann as any).id} className={`p-5 rounded-2xl border transition-all ${ann.isImportant ? 'bg-red-50/50 border-red-200 shadow-sm' : 'bg-white border-slate-200'}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-md ${ann.isImportant ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                                    {ann.isImportant ? 'Importante' : 'Comunicazione'}
                                                </span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                                                        <Icon type="clock" className="w-3.5 h-3.5"/> 
                                                        {new Date(ann.$createdAt || Date.now()).toLocaleDateString('it-IT')}
                                                    </span>
                                                    {isAdmin && (
                                                        <button onClick={() => setAnnouncementToDelete(ann.$id || (ann as any).id)} className="text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 transition-colors p-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-red-400" title="Elimina">
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
                                        <h3 className="font-extrabold text-slate-800 text-lg">Turni della Settimana</h3>
                                        <p className="text-sm text-slate-500 font-medium">Controlla gli orari e le assegnazioni del team.</p>
                                    </div>
                                    {isAdmin && (
                                        <button onClick={()=>setShowAddShift(!showAddShift)} className="w-full sm:w-auto bg-blue-50 text-blue-700 font-bold px-5 py-2.5 rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                            <Icon type={showAddShift ? "x" : "plus"} className="w-4 h-4"/> {showAddShift ? 'Annulla' : 'Assegna Turno'}
                                        </button>
                                    )}
                                </div>
                                
                                {isAdmin && showAddShift && (
                                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_auto] gap-4 items-start animate-in slide-in-from-top-4">
                                        {staff.length === 0 ? (
                                            <p className="sm:col-span-2 lg:col-span-5 text-sm text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200">Non ci sono ancora membri dello staff in questa pagina: assumi un candidato da un annuncio per assegnargli dei turni.</p>
                                        ) : (
                                            <>
                                                <Field id="shift-user" label="Membro dello staff" error={shiftErrors.userId}>
                                                    <select value={newShift.userId} onChange={(e) => { const s = staff.find(st => st.$id === e.target.value || st.userId === e.target.value); setNewShift(s ? {...newShift, userId: s.userId || s.$id, userName: `${s.firstName} ${s.lastName}`, role: s.title || 'Staff'} : {...newShift, userId: ''}); }}>
                                                        <option value="">Scegli…</option>
                                                        {staff.map(s=><option key={s.$id} value={s.userId || s.$id}>{s.firstName} {s.lastName}</option>)}
                                                    </select>
                                                </Field>
                                                <Field id="shift-date" label="Data" error={shiftErrors.date}>
                                                    <input type="date" min={todayISO()} max={addDaysISO(todayISO(), 180)} value={newShift.date} onChange={e=>setNewShift({...newShift, date: e.target.value})} />
                                                </Field>
                                                <Field id="shift-start" label="Inizio" error={shiftErrors.start}>
                                                    <input type="time" step={900} value={newShift.start} onChange={e=>setNewShift({...newShift, start: e.target.value})} />
                                                </Field>
                                                <Field id="shift-end" label="Fine" error={shiftErrors.end}>
                                                    <input type="time" step={900} min={newShift.start || undefined} value={newShift.end} onChange={e=>setNewShift({...newShift, end: e.target.value})} />
                                                </Field>
                                                <button onClick={handleConfirmShift} className="lg:mt-7 bg-corsia-600 text-white font-semibold py-3 px-5 rounded-xl hover:bg-corsia-700 transition-colors">
                                                    Assegna
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                                
                                <div className="overflow-x-auto rounded-xl border border-slate-200">
                                    <table className="w-full text-left border-collapse whitespace-nowrap">
                                        <thead className="bg-slate-50">
                                            <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                                                <th className="py-3 px-4 font-bold">Membro</th>
                                                <th className="py-3 px-4 font-bold">Data</th>
                                                <th className="py-3 px-4 font-bold">Orario / Ruolo</th>
                                                {isAdmin && <th className="py-3 px-4 font-bold text-right">Azioni</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {shifts.length === 0 && <tr><td colSpan={isAdmin ? 4 : 3} className="py-8 text-center text-slate-400 font-medium">Nessun turno assegnato.</td></tr>}
                                            {shifts.map(shift => (
                                                <tr key={shift.$id} className={`group transition-colors ${shift.userId === user?.$id ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'}`}>
                                                    <td className="py-4 px-4 font-bold text-slate-800 flex items-center gap-2">
                                                        {shift.userId === user?.$id && <div className="w-2 h-2 bg-blue-600 rounded-full"></div>}
                                                        {shift.userName}
                                                    </td>
                                                    <td className="py-4 px-4 text-slate-600 text-sm font-medium">{formatDate(shift.date, 'weekday')}</td>
                                                    <td className="py-4 px-4">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-slate-800 text-sm font-bold flex items-center gap-1.5"><Icon type="clock" className="w-3.5 h-3.5 text-slate-400"/>{shift.shiftTime}</span>
                                                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold w-max">{shift.role}</span>
                                                        </div>
                                                    </td>
                                                    {isAdmin && (
                                                        <td className="py-4 px-4 text-right">
                                                            <button onClick={() => handleDeleteShift(shift.$id)} className="text-xs font-extrabold text-slate-400 hover:text-red-600 p-2 rounded-lg transition-colors ml-auto outline-none">
                                                                <Icon type="x" className="w-5 h-5"/>
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {isAdmin && staffSubTab === 'radar' && (
                            <div className="animate-in fade-in">
                                {isLoadingStaff ? (
                                    <div className="p-10 text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-indigo-600 mx-auto mb-3"></div>
                                        <p className="text-slate-500 font-medium">Sincronizzazione staff...</p>
                                    </div>
                                ) : staff.length > 0 ? (
                                    <div className="divide-y divide-slate-100">
                                        {staff.map(member => {
                                            const name = `${member.firstName} ${member.lastName}`.trim();
                                            const certs: Certification[] = (member.certificationsList || []).map(c => {
                                                try { return typeof c === 'string' ? JSON.parse(c) : c; } catch { return null; }
                                            }).filter(Boolean);
                                            
                                            const problems = certs.filter(c => isCertExpiringOrExpired(c.expiry));

                                            return (
                                                <div key={member.$id} className="p-6 flex flex-col sm:flex-row gap-6 items-start hover:bg-slate-50 transition-colors relative group">
                                                    
                                                    {isAdmin && (
                                                        <button 
                                                            onClick={() => handleRemoveStaff(member.userId || member.$id)}
                                                            className="absolute top-4 right-4 text-slate-300 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg sm:opacity-0 group-hover:opacity-100 transition-all outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500"
                                                            title="Rimuovi dal Team"
                                                        >
                                                            <Icon type="user-minus" className="w-5 h-5" />
                                                        </button>
                                                    )}

                                                    <div className="flex items-center gap-4 min-w-[200px]">
                                                        <div className="relative">
                                                            <img src={member.avatar || initialsAvatar(name)} alt={name} className="w-12 h-12 rounded-full border border-slate-200" />
                                                            {member.isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm"></div>}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-800">{name}</p>
                                                            <p className="text-xs text-slate-500 font-medium">{member.title || 'Professionista'}</p>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                                        {certs.length === 0 ? (
                                                            <p className="text-sm text-slate-500 flex items-center gap-2"><Icon type="info" className="w-4 h-4"/> Nessun brevetto registrato</p>
                                                        ) : problems.length > 0 ? (
                                                            <div className="space-y-2">
                                                                <p className="text-sm font-bold text-red-600 flex items-center gap-2 mb-3">
                                                                    <Icon type="alert-triangle" className="w-4 h-4" /> Attenzione Richiesta
                                                                </p>
                                                                {problems.map((p, idx) => (
                                                                    <div key={idx} className="flex items-center justify-between text-xs bg-red-50 text-red-800 px-3 py-2 rounded-md border border-red-100">
                                                                        <span className="font-bold truncate max-w-[150px]">{p.name}</span>
                                                                        <span className="font-medium">Scade: {new Date(p.expiry!).toLocaleDateString('it-IT')}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-3 text-green-700 bg-green-50 px-4 py-3 rounded-lg border border-green-100">
                                                                <Icon type="check-double" className="w-5 h-5" />
                                                                <p className="text-sm font-bold">Tutti i brevetti ({certs.length}) sono in regola.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                                            <Icon type="users" className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <p className="text-slate-600 font-bold text-lg">Il tuo Team è vuoto</p>
                                        <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
                                            Pubblica un annuncio di lavoro, accetta i candidati validi e li vedrai apparire magicamente in questa dashboard!
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 4. STATISTICHE (solo amministratori): solo dati reali */}
                {activeTab === 'analytics' && isAdmin && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 animate-in fade-in duration-300">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-abisso">Statistiche</h2>
                            <p className="text-sm text-slate-500 mt-1">Annunci pubblicati da questa pagina e candidature ricevute.</p>
                        </div>
                        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                            {[
                                { label: 'Annunci aperti', value: metrics.openJobs },
                                { label: 'SOS in corso', value: metrics.sosJobs },
                                { label: 'Candidature ricevute', value: metrics.candidates },
                                { label: isLegacyStructure ? 'Collegamenti' : 'Follower', value: followersCount },
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
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={metrics.perJob} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                        <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <YAxis type="category" dataKey="name" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#0A2738' }} />
                                        <Tooltip cursor={{ fill: '#F2F8FA' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                                        <Bar dataKey="candidature" name="Candidature" fill="#0E6A97" radius={[0, 6, 6, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-6 text-center">Le candidature ai tuoi annunci compariranno qui.</p>
                        )}
                    </div>
                )}
            </div>

            {isAdmin && isLegacyStructure && (
                <ProfileEditModal open={isEditingProfile} profile={facility as StructureProfile} onClose={() => setIsEditingProfile(false)} onSaved={(p) => onUpdateProfile?.(p as StructureProfile)} />
            )}
            {isAdmin && !isLegacyStructure && (
                <FacilityFormModal
                    open={isEditingProfile}
                    mode="edit"
                    initial={{ name: structureName, type: structureType, city, province, bio }}
                    onClose={() => setIsEditingProfile(false)}
                    onSubmit={handleSaveFacility}
                />
            )}

            {/* MODAL ELIMINAZIONE ANNUNCIO */}
            {announcementToDelete && (
                <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Icon type="trash" className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-extrabold text-slate-900 mb-2">Elimina Annuncio</h3>
                            <p className="text-slate-500 text-sm mb-6">Sei sicuro di voler eliminare definitivamente questa comunicazione dalla bacheca del team?</p>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setAnnouncementToDelete(null)} 
                                    className="flex-1 font-bold text-slate-600 bg-slate-100 py-3 rounded-xl hover:bg-slate-200 transition outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                                >
                                    Annulla
                                </button>
                                <button 
                                    onClick={handleConfirmDeleteAnnouncement} 
                                    className="flex-1 font-bold text-white bg-red-600 py-3 rounded-xl hover:bg-red-700 transition shadow-md outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                >
                                    Elimina
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
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