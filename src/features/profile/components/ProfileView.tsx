import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import confetti from 'canvas-confetti';
import { useNavigate } from 'react-router-dom';
import type { UserProfile, StructureProfile, Experience, Certification, Facility } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { ExperienceModal } from './ExperienceModal';
import { CertificationModal } from './CertificationModal';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { ImageUploadButton } from '@/components/ui/ImageUploadButton';
import { ReportModal } from '@/components/common/ReportModal';
import { SkillsSection } from './SkillsSection';
import { ConnectButton } from '@/components/common/ConnectButton';
import { initialsAvatar } from '@/utils/avatar';
import { ProfileEditModal } from './ProfileEditModal';
import { AvailabilitySection } from './AvailabilitySection';
import { FacilityFormModal } from './FacilityFormModal';
import { CompletionRing } from './CompletionRing';
import { PoolSection } from './PoolSection';
import { certCategoryLabel, employmentLabel } from '@/data/swimming';
import { provinceName } from '@/data/italy';
import { experiencePeriod, formatDate, formatDuration, sortExperiences, totalExperienceMonths } from '@/utils/dates';
import { certificationStatus } from '@/utils/certifications';

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
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [confettiFired, setConfettiFired] = useState(false);
    
    const isProfessional = user.userType === 'professional';
    const profUser = isProfessional ? (user as UserProfile) : null;

    const [experienceModal, setExperienceModal] = useState<{isOpen: boolean, mode: 'add'|'edit', experience?: Experience, index?: number}>({ isOpen: false, mode: 'add' });
    const [certificationModal, setCertificationModal] = useState<{isOpen: boolean, mode: 'add'|'edit', certification?: Certification, index?: number}>({ isOpen: false, mode: 'add' });

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

    /** Passi per completare il profilo: punteggio e cosa manca ancora. */
    const completionSteps = useMemo(() => {
        if (!isProfessional || !profUser) return [];
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
    }, [profUser, experiences, certifications, isProfessional]);
    const completionScore = completionSteps.reduce((sum, s) => sum + (s.done ? s.weight : 0), 0);
    const missingSteps = completionSteps.filter((s) => !s.done);

    useEffect(() => {
        if (completionScore === 100 && !confettiFired && isOwnProfile) {
            const duration = 3 * 1000;
            const end = Date.now() + duration;
            const frame = () => {
                confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#0E6A97', '#12B5AE', '#ffffff'] });
                confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#0E6A97', '#12B5AE', '#ffffff'] });
                if (Date.now() < end) requestAnimationFrame(frame);
            };
            frame();
            setConfettiFired(true);
            showToast('Complimenti! Hai sbloccato il Badge Pioniere SwimIn!', 'success');
        }
    }, [completionScore, confettiFired, isOwnProfile, showToast]);

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
        const newFac = await databaseService.createFacility({ name: data.name, type: data.type, city: data.city, province: data.province }, adminId);
        if (!newFac) {
            showToast('Non è stato possibile creare la pagina. Riprova.', 'error');
            throw new Error('createFacility');
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
                    const url = `${window.location.origin}/profile/${user.userId || user.$id}`;
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

            {isProfessional && (
                <button 
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF}
                    className="bg-slate-800 text-white font-bold px-4 py-2 rounded-xl hover:bg-slate-900 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
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

      {isProfessional && isOwnProfile && profUser && (
        <div className="bg-red-50 rounded-3xl shadow-sm border border-red-200 p-6 sm:p-8 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
                <h2 className="text-xl font-extrabold text-red-700 flex items-center gap-2">
                    <Icon type="alert-triangle" className="w-6 h-6" />
                    Disponibilità per sostituzioni urgenti
                </h2>
                <p className="text-red-600 text-sm mt-2 font-medium max-w-xl">
                    Attiva questa modalità per segnalare la tua disponibilità immediata. Riceverai priorità per le chiamate SOS dalle piscine nella tua zona.
                </p>
            </div>
            <button
                role="switch"
                aria-checked={!!profUser.availableForEmergencies}
                aria-label="Disponibilità per sostituzioni urgenti"
                onClick={async () => {
                    const newState = !profUser.availableForEmergencies;
                    const updated = await databaseService.updateProfile(profUser.userId || profUser.$id, { availableForEmergencies: newState });
                    if (onUpdateProfile) onUpdateProfile(updated as UserProfile);
                    showToast(newState ? 'Disponibilità attivata: le piscine vicine possono contattarti per le sostituzioni urgenti.' : 'Disponibilità per sostituzioni disattivata.', 'success');
                }}
                className={`relative inline-flex h-8 w-16 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${profUser.availableForEmergencies ? 'bg-red-600 shadow-inner' : 'bg-red-200'}`}
            >
                <span className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${profUser.availableForEmergencies ? 'translate-x-8' : 'translate-x-0'}`} />
            </button>
        </div>
      )}

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
      {isProfessional && isOwnProfile && (
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
                      <button
                          onClick={() => onContact(user.userId || user.$id)}
                          className="flex-1 sm:flex-none justify-center whitespace-nowrap px-5 py-2.5 bg-white border border-corsia-200 text-corsia-700 hover:border-corsia-400 font-semibold rounded-full transition-all flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                      >
                          <Icon type="chat-bubble" className="w-4 h-4" /> Messaggio
                      </button>
                      <button
                          onClick={() => setIsReportOpen(true)}
                          className="flex-shrink-0 p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          aria-label="Segnala profilo"
                          title="Segnala profilo"
                      >
                          <Icon type="alert-triangle" className="w-5 h-5" />
                      </button>
                    </div>
                  )}
              </div>

              <div className="mt-4 sm:mt-6">
                  <div className="flex items-center gap-3 mb-1">
                      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{displayName}</h1>
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
                          {user.city ? `${user.city}${user.province ? `, ${provinceName(user.province) || user.province}` : ''}` : isOwnProfile ? 'Aggiungi la città' : 'Località non indicata'}
                      </span>
                      {experienceMonths >= 12 && (
                          <span className="flex items-center gap-1.5"><Icon type="briefcase" className="w-4 h-4" /> {formatDuration(Math.floor(experienceMonths / 12) * 12)} di esperienza</span>
                      )}
                      <span className="flex items-center gap-1.5 text-corsia-700 bg-corsia-50 px-2 py-1 rounded-lg"><Icon type="users" className="w-4 h-4" /> {(user.connections?.length || 0) === 1 ? '1 collegamento' : `${user.connections?.length || 0} collegamenti`}</span>
                  </div>
                  {(user.phone || user.website || (profUser?.languages || []).length > 0) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-sm">
                          {user.phone && (
                              <a href={`tel:${user.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 text-corsia-700 font-semibold hover:underline">
                                  <Icon type="phone" className="w-4 h-4" /> {user.phone}
                              </a>
                          )}
                          {user.website && (
                              <a href={user.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-corsia-700 font-semibold hover:underline max-w-full">
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

          {isProfessional && profUser && (
            <AvailabilitySection profile={profUser} isOwnProfile={isOwnProfile} onUpdated={(p) => onUpdateProfile?.(p)} />
          )}

          {!isProfessional && <PoolSection profile={user as StructureProfile} isOwnProfile={isOwnProfile} onEdit={() => setIsEditingProfile(true)} />}

          {isProfessional && profUser && (
            <SkillsSection
                profile={profUser}
                isOwnProfile={isOwnProfile}
                onProfileUpdated={(p) => onUpdateProfile?.(p)}
            />
          )}

          {isProfessional && (
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
                                            <h3 className="font-bold leading-tight text-abisso">{cert.name}</h3>
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
                                    </div>
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
      <CertificationModal
        isOpen={certificationModal.isOpen}
        onClose={() => setCertificationModal({ isOpen: false, mode: 'add' })}
        onSave={handleSaveCertification}
        onDelete={certificationModal.index !== undefined ? () => handleDeleteCertification(certificationModal.index!) : undefined}
        certification={certificationModal.certification}
        mode={certificationModal.mode}
      />
      {isOwnProfile && (
        <ProfileEditModal open={isEditingProfile} profile={user} onClose={() => setIsEditingProfile(false)} onSaved={(p) => onUpdateProfile?.(p)} />
      )}
      {isProfessional && isOwnProfile && (
        <FacilityFormModal open={isFacilityModalOpen} mode="create" onClose={() => setIsFacilityModalOpen(false)} onSubmit={handleCreateFacility} />
      )}

      {isReportOpen && <ReportModal targetType="profile" targetId={user.userId || user.$id} onClose={() => setIsReportOpen(false)} />}
    </div>
  );
};
