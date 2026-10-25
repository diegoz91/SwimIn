import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { UserProfile, StructureProfile, Experience, Certification, Facility } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { ExperienceModal } from './ExperienceModal';
import { CertificationModal } from './CertificationModal';
import { CertVerifyModal } from './CertVerifyModal';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { ImageUploadButton } from '@/components/ui/ImageUploadButton';
import { ReportModal } from '@/components/common/ReportModal';
import { SkillsSection } from './SkillsSection';
import { RecommendationsSection } from './RecommendationsSection';
import { useAuth } from '@/hooks/useAuth';
import { ConnectButton } from '@/components/common/ConnectButton';
import { ProfileActionsMenu } from '@/components/common/ProfileActionsMenu';
import { useBlocks } from '@/context/BlocksContext';
import { initialsAvatar } from '@/utils/avatar';
import { isEnthusiast } from '@/utils/profile';
import { useContactInfo } from '@/hooks/useContactInfo';
import { PeopleModal, type PersonRow } from '@/components/common/PeopleModal';
import { FollowButton } from '@/components/common/FollowButton';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { formatRelativeTime } from '@/utils/format';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { isPremium } from '@/utils/premium';
import { ProfileAnalyticsCard } from '@/features/premium/ProfileAnalyticsCard';
import { ProfileEditModal } from './ProfileEditModal';
import { AvailabilitySection } from './AvailabilitySection';
import { FacilityFormModal } from './FacilityFormModal';
import { CompletionRing } from './CompletionRing';
import { PoolSection } from './PoolSection';
import { certCategoryLabel, employmentLabel } from '@/data/swimming';
import { experiencePeriod, formatDate, formatDuration, sortExperiences, totalExperienceMonths } from '@/utils/dates';
import { certificationStatus } from '@/utils/certifications';
import { useRecommendations } from './recommendations/useRecommendations';
import type { Recommendation } from '@/services/database';
import { RecommendationReviewModal } from './recommendations/RecommendationReviewModal';
import { AskRecommendationModal } from './recommendations/AskRecommendationModal';

interface ProfileViewProps {
  user: UserProfile | StructureProfile;
  onBack: () => void;
  onContact: (userId: string) => void;
  isOwnProfile?: boolean;
  onUpdateProfile?: (profile: UserProfile | StructureProfile) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ 
  user, 
  onBack, 
  onContact, 
  isOwnProfile = false,
  onUpdateProfile 
}) => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user: viewer } = useAuth();
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    
    const isProfessional = user.userType === 'professional';
    /** Nuota per passione: il profilo mette in primo piano attività e community, non il lavoro. */
    const isFan = isEnthusiast(user);
    const blocks = useBlocks();
    const isWorker = isProfessional && !isFan;
    const profUser = isProfessional ? (user as UserProfile) : null;
    /** Referenze: le scrivono i collegamenti reciproci e le strutture per cui la persona lavora (il server lo ricontrolla). */
    const profileKeyId = user.userId || user.$id;
    const mutual = !!viewer && (viewer.connections || []).includes(profileKeyId) && (user.connections || []).includes(viewer.$id);
    const canWriteRecommendation = !isOwnProfile && isProfessional && !!viewer && (mutual || (viewer.userType === 'structure' && ((viewer as StructureProfile).staff || []).includes(profileKeyId)));
    const askRecommendation = async () => {
        try {
            const r = await databaseService.requestRecommendation(profileKeyId);
            showToast(r.already ? 'Hai già chiesto una referenza a questa persona.' : 'Richiesta inviata.', r.already ? 'info' : 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Richiesta non inviata.', 'error');
        }
    };

    const [experienceModal, setExperienceModal] = useState<{isOpen: boolean, mode: 'add'|'edit', experience?: Experience, index?: number}>({ isOpen: false, mode: 'add' });
    const [certificationModal, setCertificationModal] = useState<{isOpen: boolean, mode: 'add'|'edit', certification?: Certification, index?: number}>({ isOpen: false, mode: 'add' });

    const [verifyCert, setVerifyCert] = useState<Certification | null>(null);
    // Recapiti privati delle persone: il server li dà solo a chi può vederli.
    const contact = useContactInfo(user.userId || user.$id, isProfessional);
    const phone = isProfessional ? contact?.phone || '' : user.phone || '';
    const email = isProfessional && contact?.allowed && !isOwnProfile ? contact.email : '';

    // STATI PER PAGINE AZIENDALI
    const [managedFacilities, setManagedFacilities] = useState<Facility[]>([]);
    const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false);
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    const safeParse = <T,>(data: any): T[] => {
        if (!data || !Array.isArray(data)) return [];
        return data.map(item => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; } 
            catch { return null; }
        }).filter(Boolean);
    };

    const experiences = profUser ? safeParse<Experience>(profUser.experienceList) : [];
    /** Esperienze ordinate per data, con l'indice originale per modificarle. */
    const sortedExperiences = useMemo(() => sortExperiences(experiences.map((e, index) => ({ ...e, index }))), [experiences]);
    const experienceMonths = totalExperienceMonths(experiences);
    const certifications = profUser ? safeParse<Certification>(profUser.certificationsList) : [];
    const verifiedCerts = certifications.filter((c) => c.verified).length;

    /** Passi per completare il profilo: punteggio e cosa manca ancora. */
    const completionSteps = useMemo(() => {
        if (!isProfessional || !profUser) return [];
        if (isFan) return [
            { label: 'Nome e cognome', done: !!(profUser.firstName && profUser.lastName), weight: 20 },
            { label: 'Foto profilo', done: !!profUser.avatar, weight: 20 },
            { label: 'Città', done: !!profUser.city, weight: 20 },
            { label: 'Presentazione', done: !!profUser.bio, weight: 20 },
            { label: 'Attività praticate', done: (profUser.sports || []).length > 0, weight: 20 },
        ];
        return [
            { label: 'Nome e cognome', done: !!(profUser.firstName && profUser.lastName), weight: 10 },
            { label: 'Foto profilo', done: !!profUser.avatar, weight: 10 },
            { label: 'Qualifica', done: !!profUser.title, weight: 10 },
            { label: 'Città', done: !!profUser.city, weight: 10 },
            { label: 'Presentazione', done: !!profUser.bio, weight: 10 },
            { label: 'Esperienze', done: experiences.length > 0, weight: 20 },
            { label: 'Brevetti', done: certifications.length > 0, weight: 20 },
            { label: 'Competenze', done: (profUser.skills || []).length > 0, weight: 5 },
            { label: 'Disponibilità', done: (profUser.availability || []).length > 0, weight: 5 },
        ];
    }, [profUser, experiences, certifications, isProfessional, isFan]);
    const completionScore = completionSteps.reduce((sum, s) => sum + (s.done ? s.weight : 0), 0);
    const missingSteps = completionSteps.filter((s) => !s.done);

    // Collegamenti e visite al profilo (elenchi in finestra).
    const [connectionsOpen, setConnectionsOpen] = useState(false);
    const [followersOpen, setFollowersOpen] = useState(false);
    const [followers, setFollowers] = useState(user.followersCount || 0);
    useEffect(() => setFollowers(user.followersCount || 0), [user.followersCount]);
    const [viewsOpen, setViewsOpen] = useState(() => isOwnProfile && new URLSearchParams(window.location.search).get('visite') === '1');
    // Referenze: condivise tra l'avviso "da approvare" qui in alto e la sezione più in basso.
    const recs = useRecommendations(profileKeyId, isProfessional);
    const [review, setReview] = useState<{ open: boolean; startId?: string }>({ open: false });
    const [askOpen, setAskOpen] = useState(false);
    // Dalla notifica "ha scritto una referenza per te" (?referenze=approva) si apre subito la revisione.
    const autoReview = useRef(isOwnProfile && new URLSearchParams(window.location.search).get('referenze') === 'approva');
    useEffect(() => {
        if (autoReview.current && recs.pending.length) {
            autoReview.current = false;
            setReview({ open: true });
        }
    }, [recs.pending.length]);
    const [viewsCount, setViewsCount] = useState<number | null>(null);
    const profileKey = user.userId || user.$id;
    useEffect(() => {
        if (isOwnProfile) {
            databaseService.listProfileViews().then((r) => setViewsCount(r?.total ?? 0)).catch((err) => console.warn('Visite al profilo:', err));
        } else {
            // Avvisa il proprietario della visita (il server evita doppioni nelle 24 ore).
            databaseService.recordProfileView(profileKey).catch((err) => console.warn('Visita non registrata:', err));
        }
    }, [isOwnProfile, profileKey]);
    const loadConnections = async (): Promise<PersonRow[]> =>
        (await databaseService.getProfilesByIds(user.connections || []))
            .filter((p) => !blocks.isHidden(p.$id) && !p.suspended)
            .map((p) => ({ id: p.$id, name: displayNameOf(p), headline: headlineOf(p), avatar: avatarOf(p) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const [lockedViews, setLockedViews] = useState(0);
    const loadViews = async (): Promise<PersonRow[]> => {
        const r = await databaseService.listProfileViews();
        setViewsCount(r?.total ?? 0);
        setLockedViews(r?.locked || 0);
        return (r?.viewers || []).map((v) => ({ id: v.id, name: v.name, headline: v.headline, avatar: v.avatar, meta: formatRelativeTime(v.viewedAt) }));
    };

    // Coriandoli una volta sola: quando il punteggio passa a 100% durante la sessione,
    // mai se il profilo era già completo all'apertura (né su altri dispositivi dopo).
    const previousScore = useRef<number | null>(null);
    const ownerId = user.userId || user.$id;
    useEffect(() => {
        if (!isOwnProfile) return;
        const key = `swimin:profilo-completo:${ownerId}`;
        const prev = previousScore.current;
        previousScore.current = completionScore;
        if (completionScore < 100) return;
        let celebrated = false;
        try { celebrated = localStorage.getItem(key) === '1'; localStorage.setItem(key, '1'); } catch (err) { console.warn('Preferenza non salvata:', err); }
        if (celebrated || prev === null || prev >= 100) return;
        const end = Date.now() + 3000;
        // Libreria caricata solo per la festa del profilo completo.
        void import('canvas-confetti')
            .then(({ default: confetti }) => {
                const frame = () => {
                    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#0E6A97', '#12B5AE', '#ffffff'], disableForReducedMotion: true });
                    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#0E6A97', '#12B5AE', '#ffffff'], disableForReducedMotion: true });
                    if (Date.now() < end) requestAnimationFrame(frame);
                };
                frame();
            })
            .catch((err) => console.error('Coriandoli:', err));
        showToast('Profilo completo al 100%: ora le strutture ti trovano più facilmente.', 'success');
    }, [completionScore, isOwnProfile, ownerId, showToast]);

    // FETCH PAGINE AZIENDALI
    useEffect(() => {
        if (isProfessional && isOwnProfile && profUser) {
            const fetchFacilities = async () => {
                const facs = await databaseService.getManagedFacilities(profUser.userId || profUser.$id);
                setManagedFacilities(facs);
            };
            fetchFacilities();
        }
    }, [isProfessional, isOwnProfile, profUser]);

    const displayName = isProfessional 
        ? `${(user as UserProfile).firstName || ''} ${(user as UserProfile).lastName || ''}`.trim() || 'Utente'
        : (user as StructureProfile).structureName || 'Struttura';
    
    const displayAvatar = (isProfessional ? (user as UserProfile).avatar : (user as StructureProfile).logo) || 
        initialsAvatar(displayName);
    
    const coverImage = user.cover || null;

    /** Salva avatar o copertina e aggiorna il profilo mostrato. */
    const saveImage = async (field: 'avatar' | 'logo' | 'cover', url: string) => {
        const updated = await databaseService.updateProfile(user.userId || user.$id, { [field]: url });
        if (onUpdateProfile) onUpdateProfile({ ...user, ...updated } as UserProfile);
    };

    const handleDownloadPDF = async () => {
        setIsGeneratingPDF(true);
        showToast('Generazione Passaporto in corso...', 'info');
        try {
            const element = document.getElementById('passaporto-natatorio');
            if (!element) throw new Error("Elemento non trovato");

            // Librerie del PDF caricate solo quando servono (pesano diverse centinaia di kB).
            const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#f8fafc' });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Passaporto_Natatorio_${displayName.replace(/\s+/g, '_')}.pdf`);
            showToast('Passaporto scaricato con successo!', 'success');
        } catch (error) {
            showToast('Errore durante la generazione del PDF.', 'error');
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const handleCreateFacility = async (data: { name: string; type: string; city: string; province: string }) => {
        if (!profUser) return;
        const adminId = profUser.userId || profUser.$id;
        let newFac: Facility;
        try {
            newFac = await databaseService.createFacility({ name: data.name, type: data.type, city: data.city, province: data.province }, adminId);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Non è stato possibile creare la pagina. Riprova.', 'error');
            throw error;
        }
        setManagedFacilities([newFac, ...managedFacilities]);
        showToast('Pagina della struttura creata.', 'success');
        onUpdateProfile?.({ ...profUser, managedFacilities: [...(profUser.managedFacilities || []), newFac.$id] });
    };

    const handleSaveExperience = async (exp: Experience) => {
        if (!profUser) return;
        const newList = [...experiences];
        if (experienceModal.mode === 'edit' && experienceModal.index !== undefined) {
            newList[experienceModal.index] = exp;
        } else {
            newList.push(exp);
        }
        const updatedProfile = await databaseService.updateProfile(user.userId || user.$id, { experienceList: newList.map(e => JSON.stringify(e)) });
        if (onUpdateProfile) onUpdateProfile(updatedProfile as UserProfile);
    };

    const handleDeleteExperience = async (index: number) => {
        if (!profUser) return;
        const newList = experiences.filter((_, i) => i !== index);
        const updatedProfile = await databaseService.updateProfile(user.userId || user.$id, { experienceList: newList.map(e => JSON.stringify(e)) });
        if (onUpdateProfile) onUpdateProfile(updatedProfile as UserProfile);
    };

    const handleSaveCertification = async (cert: Certification) => {
        if (!profUser) return;
        const newList = [...certifications];
        if (certificationModal.mode === 'edit' && certificationModal.index !== undefined) {
            newList[certificationModal.index] = cert;
        } else {
            newList.push(cert);
        }
        const updatedProfile = await databaseService.updateProfile(user.userId || user.$id, { certificationsList: newList.map(e => JSON.stringify(e)) });
        if (onUpdateProfile) onUpdateProfile(updatedProfile as UserProfile);
    };

    const handleDeleteCertification = async (index: number) => {
        if (!profUser) return;
        const newList = certifications.filter((_, i) => i !== index);
        const updatedProfile = await databaseService.updateProfile(user.userId || user.$id, { certificationsList: newList.map(e => JSON.stringify(e)) });
        if (onUpdateProfile) onUpdateProfile(updatedProfile as UserProfile);
    };

    if (!isOwnProfile && (blocks.isHidden(user.userId || user.$id) || user.suspended)) {
        const iBlocked = blocks.blocked.includes(user.userId || user.$id);
        return (
            <div className="max-w-lg mx-auto text-center py-20">
                <Icon type="user-minus" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <h1 className="text-3xl font-bold text-abisso">{iBlocked ? `Hai bloccato ${displayName}` : 'Profilo non disponibile'}</h1>
                <p className="text-slate-500 mt-2">{iBlocked ? 'Non vedi i suoi contenuti e non può contattarti.' : user.suspended ? 'Questo account è stato sospeso.' : 'Questo profilo non è visibile.'}</p>
                <div className="flex justify-center gap-3 mt-6">
                    <button onClick={onBack} className="px-5 py-2.5 rounded-full font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200">Torna indietro</button>
                    {iBlocked && <button onClick={() => blocks.unblock(user.userId || user.$id)} className="px-5 py-2.5 rounded-full font-semibold text-white bg-corsia-600 hover:bg-corsia-700">Sblocca</button>}
                </div>
            </div>
        );
    }

    return (
    <div className="max-w-4xl mx-auto py-4 sm:py-6 animate-in fade-in duration-500">
      
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        
        {/* 💡 FIX TASTO INDIETRO (Scompare se sei sul tuo profilo) */}
        <div className="flex-1">
            {!isOwnProfile ? (
                <button 
                    onClick={onBack} 
                    className="text-blue-600 font-semibold hover:underline flex items-center gap-2 group transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
                >
                    <Icon type="arrow-left" className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> 
                    Torna indietro
                </button>
            ) : (
                <div className="text-xl font-extrabold text-slate-800 hidden sm:block">Il tuo profilo</div>
            )}
        </div>

        {/* 💡 NUOVI BOTTONI AZIONE HEADER */}
        <div className="flex items-center gap-3">
            <button
                onClick={async () => {
                    // Link pubblico se il profilo lo è (si apre anche senza account), altrimenti quello interno.
                    const isPublic = !isProfessional || !!user.publicProfile;
                    const url = `${window.location.origin}/${isPublic ? 'u' : 'profile'}/${user.userId || user.$id}`;
                    try {
                        if (navigator.share) await navigator.share({ title: `${displayName} su SwimIn`, url });
                        else { await navigator.clipboard.writeText(url); showToast('Link del profilo copiato.', 'success'); }
                    } catch { /* condivisione annullata */ }
                }}
                className="bg-white border border-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Condividi profilo"
            >
                <Icon type="share" className="w-4 h-4" /> <span className="hidden sm:inline">Condividi</span>
            </button>
            {isOwnProfile && (
                <button 
                    onClick={() => setIsEditingProfile(true)}
                    className="bg-corsia-600 text-white font-semibold px-4 py-2 rounded-xl hover:bg-corsia-700 transition-all flex items-center gap-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 focus-visible:ring-offset-2"
                >
                    <Icon type="edit" className="w-4 h-4" /> <span className="hidden sm:inline">Modifica profilo</span><span className="sm:hidden">Modifica</span>
                </button>
            )}

            {isWorker && (
                <button 
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF}
                    className="bg-abisso text-white font-bold px-4 py-2 rounded-xl hover:bg-corsia-900 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                >
                    {isGeneratingPDF ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <Icon type="document" className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Scarica PDF</span>
                    <span className="sm:hidden">PDF</span>
                </button>
            )}
        </div>
      </div>

      <div id="passaporto-natatorio" className="bg-slate-50">
          
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative mb-6">
            <div className="h-32 sm:h-48 relative bg-gradient-to-br from-blue-800 via-blue-600 to-cyan-500">
                {coverImage && <img src={coverImage} alt="" className="w-full h-full object-cover" />}
                {isOwnProfile && (
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
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end -mt-16 sm:-mt-20 mb-4 sm:mb-0 gap-4">
                  <div className="relative z-10 w-fit">
                      <img 
                          src={displayAvatar} 
                          alt={displayName} 
                         
                          className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white shadow-md bg-white" 
                      />
                      {isOwnProfile && (
                          <ImageUploadButton
                              kind="avatar"
                              currentUrl={isProfessional ? profUser?.avatar : (user as StructureProfile).logo}
                              onUploaded={(url) => saveImage(isProfessional ? 'avatar' : 'logo', url)}
                              label="Cambia foto profilo"
                              className="absolute bottom-2 right-2 w-10 h-10"
                          />
                      )}
                  </div>
                  {!isOwnProfile && (
                    <div className="flex items-center gap-2 w-full sm:w-auto sm:justify-end" data-html2canvas-ignore="true">
                      <ConnectButton profileId={user.userId || user.$id} className="flex-1 sm:flex-none justify-center whitespace-nowrap" />
                      <FollowButton profileId={user.userId || user.$id} onChange={(_, n) => setFollowers(n)} />
                      <button
                          onClick={() => onContact(user.userId || user.$id)}
                          className="flex-1 sm:flex-none justify-center whitespace-nowrap px-5 py-2.5 bg-white border border-corsia-200 text-corsia-700 hover:border-corsia-400 font-semibold rounded-full transition-all flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                      >
                          <Icon type="chat-bubble" className="w-4 h-4" /> Messaggio
                      </button>
                      <ProfileActionsMenu userId={user.userId || user.$id} name={displayName} extraItems={mutual && viewer?.userType === 'professional' ? [{ label: 'Chiedi una referenza', icon: 'star', onClick: askRecommendation }] : []} />
                    </div>
                  )}
              </div>

              <div className="mt-4 sm:mt-6">
                  <div className="flex items-center gap-3 mb-1">
                      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        {displayName}
                        {verifiedCerts > 0 && (
                          <span title={verifiedCerts === 1 ? '1 brevetto verificato da SwimIn' : `${verifiedCerts} brevetti verificati da SwimIn`} className="inline-flex text-corsia-600">
                            <Icon type="shield" className="w-6 h-6" />
                            <span className="sr-only">Brevetti verificati</span>
                          </span>
                        )}
                        {isPremium(user) && <PremiumBadge size="md" />}
                      </h1>
                      {user.isOnline && (
                          <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-1 rounded-full text-xs font-bold shadow-sm border border-green-200 animate-in zoom-in" title="L'utente è attualmente online su SwimIn">
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                              </span>
                              Online
                          </span>
                      )}
                  </div>
                  <p className="text-lg text-slate-700 font-semibold mb-3">
                    {isProfessional ? (profUser?.title || 'Professionista') : ((user as StructureProfile).structureType || 'Struttura')}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-500 text-sm font-medium">
                      <span className="flex items-center gap-1.5">
                          <Icon type="location" className="w-4 h-4" />
                          {user.city ? `${user.city}${user.province ? ` (${user.province.toUpperCase()})` : ''}` : isOwnProfile ? 'Aggiungi la città' : 'Località non indicata'}
                      </span>
                      {experienceMonths >= 12 && (
                          <span className="flex items-center gap-1.5"><Icon type="briefcase" className="w-4 h-4" /> {formatDuration(Math.floor(experienceMonths / 12) * 12)} di esperienza</span>
                      )}
                      <button
                          type="button"
                          onClick={() => setConnectionsOpen(true)}
                          disabled={!(user.connections?.length)}
                          className="flex items-center gap-1.5 text-corsia-700 bg-corsia-50 px-2 py-1 rounded-lg font-semibold hover:bg-corsia-100 disabled:hover:bg-corsia-50 disabled:cursor-default outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                      >
                          <Icon type="users" className="w-4 h-4" /> {(user.connections?.length || 0) === 1 ? '1 collegamento' : `${user.connections?.length || 0} collegamenti`}
                      </button>
                      {followers > 0 && (
                          <button
                              type="button"
                              onClick={() => setFollowersOpen(true)}
                              className="flex items-center gap-1.5 text-slate-700 bg-slate-100 px-2 py-1 rounded-lg font-semibold hover:bg-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                          >
                              {followers === 1 ? '1 follower' : `${followers} follower`}
                          </button>
                      )}
                      {isOwnProfile && viewsCount !== null && (
                          <button
                              type="button"
                              onClick={() => setViewsOpen(true)}
                              data-html2canvas-ignore="true"
                              className="flex items-center gap-1.5 text-slate-700 bg-slate-100 px-2 py-1 rounded-lg font-semibold hover:bg-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                          >
                              <Icon type="user" className="w-4 h-4" /> {viewsCount === 1 ? '1 visita al profilo' : `${viewsCount} visite al profilo`}
                          </button>
                      )}
                  </div>
                  {(phone || email || user.website || (profUser?.languages || []).length > 0) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-sm">
                          {phone && (
                              <a href={`tel:${phone.replace(/\s/g, '')}`} className="py-1 -my-1 inline-flex items-center gap-1.5 text-corsia-700 font-semibold hover:underline" title={isOwnProfile && isProfessional ? 'Visibile solo ai tuoi collegamenti e alle strutture a cui ti candidi' : undefined}>
                                  <Icon type="phone" className="w-4 h-4" /> {phone}
                                  {isOwnProfile && isProfessional && <Icon type="lock-closed" className="w-3.5 h-3.5 text-slate-400" />}
                              </a>
                          )}
                          {email && (
                              <a href={`mailto:${email}`} className="py-1 -my-1 inline-flex items-center gap-1.5 text-corsia-700 font-semibold hover:underline max-w-full">
                                  <Icon type="paper-plane" className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{email}</span>
                              </a>
                          )}
                          {user.website && (
                              <a href={user.website} target="_blank" rel="noopener noreferrer nofollow" className="py-1 -my-1 inline-flex items-center gap-1.5 text-corsia-700 font-semibold hover:underline max-w-full">
                                  <Icon type="globe" className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{user.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                              </a>
                          )}
                          {(profUser?.languages || []).length > 0 && (
                              <span className="inline-flex items-center gap-1.5 text-slate-600">
                                  <Icon type="chat-bubble" className="w-4 h-4 text-slate-400" /> {profUser!.languages!.join(', ')}
                              </span>
                          )}
                      </div>
                  )}
              </div>
            </div>
          </div>

          {/* Riquadri visibili solo a te (fuori dal PDF del profilo): analisi, completamento, disponibilità, strutture. */}
          <div data-html2canvas-ignore="true">
      {isOwnProfile && recs.pending.length > 0 && (
        <PendingRecommendationsBanner pending={recs.pending} onReview={() => setReview({ open: true })} />
      )}
      {isWorker && isOwnProfile && profUser && (
        <div className="bg-red-50 rounded-3xl shadow-sm border border-red-200 p-6 sm:p-8 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
                <h2 className="text-xl font-extrabold text-red-700 flex items-center gap-2">
                    <Icon type="alert-triangle" className="w-6 h-6" />
                    Disponibilità per sostituzioni urgenti
                </h2>
                <p className="text-red-700 text-sm mt-2 font-medium max-w-xl">
                    Attiva questa modalità per segnalare la tua disponibilità immediata. Riceverai priorità per le chiamate SOS dalle piscine nella tua zona.
                </p>
            </div>
            <button
                role="switch"
                aria-checked={!!profUser.availableForEmergencies}
                aria-label="Disponibilità per sostituzioni urgenti"
                onClick={async () => {
                    const newState = !profUser.availableForEmergencies;
                    let updated: UserProfile;
                    try {
                        updated = (await databaseService.updateProfile(profUser.userId || profUser.$id, { availableForEmergencies: newState })) as UserProfile;
                    } catch (error) {
                        showToast(error instanceof Error ? error.message : 'Impostazione non salvata.', 'error');
                        return;
                    }
                    if (onUpdateProfile) onUpdateProfile(updated);
                    showToast(newState ? 'Disponibilità attivata: le piscine vicine possono contattarti per le sostituzioni urgenti.' : 'Disponibilità per sostituzioni disattivata.', 'success');
                }}
                className={`relative inline-flex h-8 w-16 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${profUser.availableForEmergencies ? 'bg-red-600 shadow-inner' : 'bg-red-200'}`}
            >
                <span className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${profUser.availableForEmergencies ? 'translate-x-8' : 'translate-x-0'}`} />
            </button>
        </div>
      )}

      {isOwnProfile && <ProfileAnalyticsCard premium={isPremium(user)} onOpenViews={() => setViewsOpen(true)} />}

      {isProfessional && isOwnProfile && completionScore < 100 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6 flex items-center gap-5 sm:gap-6" data-html2canvas-ignore="true">
            <CompletionRing value={completionScore} />
            <div className="min-w-0">
                <h2 className="text-xl font-extrabold text-slate-800">Completa il profilo</h2>
                <p className="text-sm text-slate-500 mt-0.5">Un profilo completo compare prima nelle ricerche delle strutture.</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {missingSteps.map((s) => (
                        <span key={s.label} className="text-xs font-semibold text-corsia-700 bg-corsia-50 border border-corsia-100 px-2.5 py-1 rounded-full">+ {s.label}</span>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* PAGINE AZIENDALI GESTITE (LINKEDIN MODEL) */}
      {isWorker && isOwnProfile && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6" data-html2canvas-ignore="true">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Icon type="building" className="w-6 h-6 text-blue-600" />
                    Le mie strutture
                </h2>
                <button
                    onClick={() => setIsFacilityModalOpen(true)}
                    className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <Icon type="plus" className="w-4 h-4" /> Crea pagina
                </button>
            </div>
            
            {managedFacilities.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {managedFacilities.map(fac => (
                        <div
                            key={fac.$id}
                            onClick={() => navigate(`/profile/${fac.$id}`)}
                            className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group bg-slate-50 hover:bg-white"
                        >
                            <div className="w-14 h-14 bg-white border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                                {fac.logo ? (
                                    <img src={fac.logo} alt={fac.name} className="w-full h-full object-cover" />
                                ) : (
                                    <Icon type="building" className="w-6 h-6 text-slate-400" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{fac.name}</h3>
                                <p className="text-xs text-slate-500 font-medium truncate">{[fac.type, fac.city].filter(Boolean).join(', ')}</p>
                            </div>
                            <Icon type="chevron-right" className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100">
                        <Icon type="building" className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-bold">Nessuna pagina gestita</p>
                    <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
                        Sei il direttore o il proprietario di un impianto? Crea la pagina della struttura per pubblicare annunci e gestire lo staff.
                    </p>
                </div>
            )}
        </div>
      )}

          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6">
            <h2 className="text-xl font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                <Icon type="info" className="w-5 h-5 text-blue-600" />
                {isProfessional ? 'Chi sono' : 'Chi siamo'}
            </h2>
            {user.bio ? (
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{user.bio}</p>
            ) : isOwnProfile ? (
                <button onClick={() => setIsEditingProfile(true)} data-html2canvas-ignore="true" className="text-corsia-700 font-semibold hover:underline">
                    Scrivi due righe di presentazione
                </button>
            ) : (
                <p className="text-slate-500">Nessuna presentazione inserita.</p>
            )}
          </div>

          {isProfessional && profUser && (profUser.sports || []).length > 0 && (
            <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6" aria-labelledby="sports-title">
              <h2 id="sports-title" className="text-xl font-extrabold text-slate-900 mb-4">{isFan ? 'In vasca' : 'Discipline praticate'}</h2>
              <ul className="flex flex-wrap gap-2">
                {(profUser.sports || []).map((sp) => (
                  <li key={sp} className="text-sm font-semibold text-corsia-800 bg-corsia-50 border border-corsia-100 px-3 py-1.5 rounded-full">{sp}</li>
                ))}
              </ul>
            </section>
          )}

          {isWorker && profUser && (
            <AvailabilitySection profile={profUser} isOwnProfile={isOwnProfile} onUpdated={(p) => onUpdateProfile?.(p)} />
          )}

          {!isProfessional && <PoolSection profile={user as StructureProfile} isOwnProfile={isOwnProfile} onEdit={() => setIsEditingProfile(true)} />}

          {isProfessional && profUser && (isWorker || (profUser.skills || []).length > 0) && (
            <SkillsSection
                profile={profUser}
                isOwnProfile={isOwnProfile}
                onProfileUpdated={(p) => onUpdateProfile?.(p)}
            />
          )}

          {isProfessional && profUser && (isOwnProfile || isWorker || canWriteRecommendation || recs.published.length > 0) && (
            <RecommendationsSection
                profile={profUser}
                isOwnProfile={isOwnProfile}
                canWrite={canWriteRecommendation}
                recs={recs}
                onReview={(startId) => setReview({ open: true, startId })}
                onAsk={() => setAskOpen(true)}
            />
          )}

          {isProfessional && (isWorker || experiences.length > 0 || certifications.length > 0) && (
            <>
                <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6" aria-labelledby="career-title">
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 id="career-title" className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                                <Icon type="briefcase" className="w-6 h-6 text-blue-600" />
                                Esperienze
                            </h2>
                            {experienceMonths > 0 && <p className="text-sm text-slate-500 mt-0.5">{formatDuration(experienceMonths)} in totale</p>}
                        </div>
                        {isOwnProfile && (
                            <button onClick={() => setExperienceModal({isOpen: true, mode: 'add'})} data-html2canvas-ignore="true" className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
                                <Icon type="plus" className="w-4 h-4" /> Aggiungi
                            </button>
                        )}
                    </div>

                    {sortedExperiences.length > 0 ? (
                        <ol className="relative border-l-2 border-corsia-100 ml-2 space-y-7">
                            {sortedExperiences.map((exp) => (
                            <li key={exp.index} className="relative pl-6 sm:pl-8">
                                <span className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-4 border-white shadow-sm ${exp.current ? 'bg-cloro-500' : 'bg-corsia-400'}`} aria-hidden="true" />
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="font-extrabold text-lg text-slate-900 leading-tight">{exp.role}</h3>
                                        <p className="text-slate-800 font-semibold mt-1 flex items-center gap-1.5 flex-wrap">
                                            <Icon type="building" className="w-4 h-4 text-slate-400" /> {exp.facility}
                                            {(exp.employmentType || exp.city) && (
                                                <span className="font-normal text-slate-500">· {[employmentLabel(exp.employmentType), exp.city].filter(Boolean).join(', ')}</span>
                                            )}
                                        </p>
                                        <p className="text-sm text-corsia-700 mt-1">{experiencePeriod(exp)}</p>
                                        {exp.description && <p className="text-sm text-slate-600 leading-relaxed mt-3 whitespace-pre-wrap">{exp.description}</p>}
                                    </div>
                                    {isOwnProfile && (
                                        <button
                                            data-html2canvas-ignore="true"
                                            onClick={() => setExperienceModal({ isOpen: true, mode: 'edit', experience: exp, index: exp.index })}
                                            className="flex-shrink-0 p-2 text-slate-400 hover:text-corsia-700 hover:bg-corsia-50 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                                            aria-label={`Modifica esperienza: ${exp.role}`}
                                        >
                                            <Icon type="pencil" className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </li>
                            ))}
                        </ol>
                    ) : (
                        <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                            <Icon type="briefcase" className="w-10 h-10 text-slate-300 mb-3 mx-auto" />
                            <p className="text-slate-600 font-semibold">{isOwnProfile ? 'Aggiungi dove hai lavorato: piscine, società, stabilimenti.' : 'Nessuna esperienza inserita.'}</p>
                        </div>
                    )}
                </section>

                <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8" aria-labelledby="certs-title">
                    <div className="flex items-center justify-between mb-6">
                        <h2 id="certs-title" className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                            <Icon type="certificate" className="w-6 h-6 text-blue-600" />
                            Brevetti e certificazioni
                        </h2>
                        {isOwnProfile && (
                            <button onClick={() => setCertificationModal({isOpen: true, mode: 'add'})} data-html2canvas-ignore="true" className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
                                <Icon type="plus" className="w-4 h-4" /> Aggiungi
                            </button>
                        )}
                    </div>

                    {certifications.length > 0 ? (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {certifications.map((cert, index) => {
                                const status = certificationStatus(cert);
                                const badge =
                                    status.state === 'expired' ? { text: `Scaduto il ${formatDate(cert.expiry, 'short')}`, cls: 'text-red-700 bg-red-50 border-red-200' }
                                    : status.state === 'expiring' ? { text: status.daysLeft === 0 ? 'Scade oggi' : `Scade tra ${status.daysLeft} giorni`, cls: 'text-amber-800 bg-amber-50 border-amber-200' }
                                    : status.state === 'valid' ? { text: `Valido fino al ${formatDate(cert.expiry, 'short')}`, cls: 'text-green-800 bg-green-50 border-green-200' }
                                    : { text: 'Senza scadenza', cls: 'text-slate-600 bg-slate-50 border-slate-200' };
                                return (
                                <li key={index} className="flex flex-col p-5 border border-slate-200 rounded-2xl bg-white hover:border-corsia-200 transition-colors">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                            <h3 className="font-bold leading-tight text-abisso flex items-center gap-1.5">
                                                {cert.name}
                                                {cert.verified && (
                                                    <span title="Brevetto verificato da SwimIn" className="inline-flex text-corsia-600"><Icon type="shield" className="w-4 h-4" /><span className="sr-only">Verificato</span></span>
                                                )}
                                            </h3>
                                            <p className="text-sm text-slate-600 mt-0.5">{cert.issuer}</p>
                                            {(cert.issueDate || cert.credentialId) && (
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {[cert.issueDate && `Rilasciato il ${formatDate(cert.issueDate, 'short')}`, cert.credentialId && `N. ${cert.credentialId}`].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                        {isOwnProfile && (
                                            <button
                                                data-html2canvas-ignore="true"
                                                onClick={() => setCertificationModal({isOpen: true, mode: 'edit', certification: cert, index})}
                                                className="flex-shrink-0 p-2 -mt-1 -mr-1 text-slate-400 hover:text-corsia-700 hover:bg-corsia-50 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                                                aria-label={`Modifica brevetto: ${cert.name}`}
                                            >
                                                <Icon type="pencil" className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mt-4">
                                        {cert.category && <span className="text-xs font-semibold text-corsia-800 bg-corsia-50 px-2 py-1 rounded-md">{certCategoryLabel(cert.category)}</span>}
                                        <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${badge.cls}`}>{badge.text}</span>
                                        {cert.verified ? (
                                            <span className="text-xs font-semibold px-2 py-1 rounded-md bg-corsia-600 text-white inline-flex items-center gap-1"><Icon type="shield" className="w-3.5 h-3.5" /> Verificato</span>
                                        ) : cert.verificationStatus === 'pending' ? (
                                            <span className="text-xs font-semibold px-2 py-1 rounded-md border border-corsia-200 bg-corsia-50 text-corsia-800">Verifica in corso</span>
                                        ) : null}
                                    </div>
                                    {isOwnProfile && !cert.verified && cert.verificationStatus === 'rejected' && (
                                        <p className="mt-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                            <strong>Verifica non riuscita.</strong> {cert.verificationNote}
                                        </p>
                                    )}
                                    {isOwnProfile && !cert.verified && cert.verificationStatus !== 'pending' && cert.id && (
                                        <button
                                            type="button"
                                            data-html2canvas-ignore="true"
                                            onClick={() => setVerifyCert(cert)}
                                            className="mt-3 self-start text-sm font-semibold text-corsia-700 hover:text-corsia-800 inline-flex items-center gap-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                                        >
                                            <Icon type="shield" className="w-4 h-4" />
                                            {cert.verificationStatus === 'rejected' ? 'Invia un nuovo documento' : 'Richiedi la verifica'}
                                        </button>
                                    )}
                                </li>
                            )})}
                        </ul>
                    ) : (
                        <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                            <Icon type="certificate" className="w-10 h-10 text-slate-300 mb-3 mx-auto" />
                            <p className="text-slate-600 font-semibold">{isOwnProfile ? 'Aggiungi i tuoi brevetti: ti avviseremo prima che scadano.' : 'Nessun brevetto inserito.'}</p>
                        </div>
                    )}
                </section>
            </>
          )}
      </div>

      <ExperienceModal
        isOpen={experienceModal.isOpen}
        onClose={() => setExperienceModal({ isOpen: false, mode: 'add' })}
        onSave={handleSaveExperience}
        onDelete={experienceModal.index !== undefined ? () => handleDeleteExperience(experienceModal.index!) : undefined}
        experience={experienceModal.experience}
        mode={experienceModal.mode}
      />
      <PeopleModal
        open={connectionsOpen}
        title={isOwnProfile ? 'I tuoi collegamenti' : `Collegamenti di ${displayName}`}
        subtitle={(user.connections?.length || 0) === 1 ? '1 collegamento' : `${user.connections?.length || 0} collegamenti`}
        load={loadConnections}
        empty={isOwnProfile ? 'Non hai ancora collegamenti: trovali nella sezione Rete.' : 'Nessun collegamento.'}
        onClose={() => setConnectionsOpen(false)}
      />
      <PeopleModal
        open={followersOpen}
        title={isOwnProfile ? 'Chi ti segue' : `Chi segue ${displayName}`}
        subtitle={followers === 1 ? '1 follower' : `${followers} follower`}
        load={async () => (await databaseService.getFollowers(user.userId || user.$id)).filter((p) => !blocks.isHidden(p.$id)).map((p) => ({ id: p.$id, name: displayNameOf(p), headline: headlineOf(p), avatar: avatarOf(p) }))}
        empty="Ancora nessun follower."
        onClose={() => setFollowersOpen(false)}
      />
      {isOwnProfile && (
        <PeopleModal
          open={viewsOpen}
          title="Chi ha visto il tuo profilo"
          subtitle="Negli ultimi 30 giorni"
          load={loadViews}
          empty="Ancora nessuna visita negli ultimi 30 giorni. Un profilo completo e qualche post aiutano a farsi trovare."
          footer={lockedViews > 0 ? (
            <div className="m-2 rounded-xl border border-oro-300 bg-oro-50 p-4 text-center">
              <p className="font-semibold text-abisso flex items-center justify-center gap-2"><PremiumBadge /> Altre {lockedViews} {lockedViews === 1 ? 'persona ha' : 'persone hanno'} visto il tuo profilo</p>
              <p className="text-sm text-slate-600 mt-1">Con Premium vedi tutti i visitatori degli ultimi 30 giorni e le statistiche.</p>
              <Link to="/premium" onClick={() => setViewsOpen(false)} className="inline-block mt-3 px-4 py-2 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900">Scopri Premium</Link>
            </div>
          ) : null}
          onClose={() => setViewsOpen(false)}
        />
      )}
      <CertificationModal
        isOpen={certificationModal.isOpen}
        onClose={() => setCertificationModal({ isOpen: false, mode: 'add' })}
        onSave={handleSaveCertification}
        onDelete={certificationModal.index !== undefined ? () => handleDeleteCertification(certificationModal.index!) : undefined}
        certification={certificationModal.certification}
        mode={certificationModal.mode}
      />
      {isOwnProfile && isProfessional && (
        <CertVerifyModal
          open={!!verifyCert}
          cert={verifyCert ?? undefined}
          userId={user.userId || user.$id}
          onClose={() => setVerifyCert(null)}
          onDone={(p) => onUpdateProfile?.(p as UserProfile)}
        />
      )}
      {isOwnProfile && (
        <ProfileEditModal open={isEditingProfile} profile={user} onClose={() => setIsEditingProfile(false)} onSaved={(p) => onUpdateProfile?.(p)} />
      )}
      {isProfessional && isOwnProfile && (
        <FacilityFormModal open={isFacilityModalOpen} mode="create" onClose={() => setIsFacilityModalOpen(false)} onSubmit={handleCreateFacility} />
      )}

      {isReportOpen && <ReportModal targetType="profile" targetId={user.userId || user.$id} onClose={() => setIsReportOpen(false)} />}
      {isOwnProfile && isProfessional && (
        <>
          <RecommendationReviewModal open={review.open} queue={recs.pending} startId={review.startId} onDone={(changed) => { setReview({ open: false }); if (changed) recs.reload(); }} />
          {profUser && <AskRecommendationModal open={askOpen} me={profUser} onClose={() => setAskOpen(false)} />}
        </>
      )}
    </div>
  );
};

/** Avviso in cima al proprio profilo: referenze ricevute che aspettano una decisione. */
const PendingRecommendationsBanner: React.FC<{ pending: Recommendation[]; onReview: () => void }> = ({ pending, onReview }) => {
    const names = [...new Set(pending.map((r) => r.author.name))];
    const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} e ${names[1]}` : `${names[0]}, ${names[1]} e altri ${names.length - 2}`;
    return (
        <section aria-labelledby="pending-recs-title" className="bg-white rounded-3xl shadow-sm border-2 border-corsia-200 p-5 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex -space-x-3 flex-shrink-0" aria-hidden="true">
                {pending.slice(0, 3).map((r) => (
                    <img key={r.$id} src={r.author.avatar || initialsAvatar(r.author.name)} alt="" className="w-12 h-12 rounded-full object-cover ring-4 ring-white bg-slate-100" />
                ))}
            </div>
            <div className="min-w-0 flex-1">
                <h2 id="pending-recs-title" className="text-lg font-bold text-abisso">
                    {pending.length === 1 ? 'Hai ricevuto una referenza' : `Hai ricevuto ${pending.length} referenze`}
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">{who} {names.length === 1 ? 'ha scritto' : 'hanno scritto'} di te. Leggi e decidi se pubblicarle sul profilo: finché non lo fai, le vedi solo tu.</p>
            </div>
            <button type="button" onClick={onReview} className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700 flex-shrink-0">
                {pending.length === 1 ? 'Leggi e decidi' : 'Rivedile'}
            </button>
        </section>
    );
};
