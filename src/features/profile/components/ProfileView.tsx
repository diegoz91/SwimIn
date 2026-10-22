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
    const [confettiFired, setConfettiFired] = useState(false);
    
    const isProfessional = user.userType === 'professional';
    const profUser = isProfessional ? (user as UserProfile) : null;

    const [experienceModal, setExperienceModal] = useState<{isOpen: boolean, mode: 'add'|'edit', experience?: Experience, index?: number}>({ isOpen: false, mode: 'add' });
    const [certificationModal, setCertificationModal] = useState<{isOpen: boolean, mode: 'add'|'edit', certification?: Certification, index?: number}>({ isOpen: false, mode: 'add' });

    // STATI PER PAGINE AZIENDALI
    const [managedFacilities, setManagedFacilities] = useState<Facility[]>([]);
    const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false);
    const [isSubmittingFacility, setIsSubmittingFacility] = useState(false);
    const [facilityForm, setFacilityForm] = useState({ name: '', type: '', city: '' });

    // 💡 STATI PER LA MODIFICA DEL PROFILO PERSONALE
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editProfileForm, setEditProfileForm] = useState({
        firstName: profUser?.firstName || '',
        lastName: profUser?.lastName || '',
        title: profUser?.title || '',
        city: user.city || '',
        province: user.province || '',
        bio: user.bio || '',
    });

    useEffect(() => {
        if (profUser) {
            setEditProfileForm({
                firstName: profUser.firstName || '',
                lastName: profUser.lastName || '',
                title: profUser.title || '',
                city: user.city || '',
                province: user.province || '',
                bio: user.bio || '',
            });
        }
    }, [profUser, user]);

    const safeParse = <T,>(data: any): T[] => {
        if (!data || !Array.isArray(data)) return [];
        return data.map(item => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; } 
            catch { return null; }
        }).filter(Boolean);
    };

    const experiences = profUser ? safeParse<Experience>(profUser.experienceList) : [];
    const certifications = profUser ? safeParse<Certification>(profUser.certificationsList) : [];

    const completionScore = useMemo(() => {
        if (!isProfessional || !profUser) return 0;
        let score = 0;
        if (profUser.firstName && profUser.lastName) score += 20;
        if (profUser.avatar) score += 10;
        if (profUser.bio) score += 20;
        if (experiences.length > 0) score += 25;
        if (certifications.length > 0) score += 25;
        return score;
    }, [profUser, experiences, certifications, isProfessional]);

    useEffect(() => {
        if (completionScore === 100 && !confettiFired && isOwnProfile) {
            const duration = 3 * 1000;
            const end = Date.now() + duration;
            const frame = () => {
                confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#3b82f6', '#60a5fa', '#ffffff'] });
                confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#3b82f6', '#60a5fa', '#ffffff'] });
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
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=eff6ff&color=1d4ed8&size=256`;
    
    const coverImage = user.cover || null;

    /** Salva avatar o copertina e aggiorna il profilo mostrato. */
    const saveImage = async (field: 'avatar' | 'logo' | 'cover', url: string) => {
        const updated = await databaseService.updateProfile(user.userId || user.$id, { [field]: url });
        if (onUpdateProfile) onUpdateProfile({ ...user, ...updated } as UserProfile);
    };

    const getCertStyles = (cert: Certification) => {
        const str = `${cert.name} ${cert.issuer} ${cert.category}`.toLowerCase();
        if (str.includes('fin') || str.includes('federazione')) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: 'text-orange-500' };
        if (str.includes('salvamento') || str.includes('bagnanti') || str.includes('sns')) return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'text-red-500' };
        return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: 'text-blue-500' };
    };

    const getExpiryStatus = (dateString?: string) => {
        if (!dateString) return { text: 'Senza Scadenza', style: 'text-slate-600 bg-slate-100 border-slate-200', icon: 'check-double' };
        const expiryDate = new Date(dateString);
        const today = new Date();
        const diffTime = expiryDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { text: `Scaduto da ${Math.abs(diffDays)} gg`, style: 'text-red-700 bg-red-100 border-red-300 animate-pulse', icon: 'x' };
        if (diffDays <= 30) return { text: `Scade tra ${diffDays} gg`, style: 'text-amber-700 bg-amber-100 border-amber-300', icon: 'alert-triangle' };
        return { text: `Scade il ${expiryDate.toLocaleDateString('it-IT')}`, style: 'text-green-700 bg-green-50 border-green-200', icon: 'check' };
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

    const handleCreateFacility = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profUser) return;
        setIsSubmittingFacility(true);
        try {
            const adminId = profUser.userId || profUser.$id;
            const newFac = await databaseService.createFacility(facilityForm, adminId);
            if (newFac) {
                setManagedFacilities([newFac, ...managedFacilities]);
                showToast('Pagina Struttura creata con successo!', 'success');
                setIsFacilityModalOpen(false);
                setFacilityForm({ name: '', type: '', city: '' });
                
                if (onUpdateProfile) {
                    const updatedManaged = [...(profUser.managedFacilities || []), newFac.$id];
                    onUpdateProfile({ ...profUser, managedFacilities: updatedManaged });
                }
            } else {
                showToast('Errore durante la creazione della pagina.', 'error');
            }
        } finally {
            setIsSubmittingFacility(false);
        }
    };

    // 💡 HANDLER SALVATAGGIO PROFILO PERSONALE
    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const updated = await databaseService.updateProfile(user.userId || user.$id, editProfileForm);
            if (onUpdateProfile) onUpdateProfile({ ...user, ...updated } as UserProfile);
            setIsEditingProfile(false);
            showToast('Profilo aggiornato con successo!', 'success');
        } catch(err) {
            showToast('Errore durante il salvataggio.', 'error');
        }
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
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-500">
      
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
                <div className="text-xl font-extrabold text-slate-800 hidden sm:block">Il tuo Passaporto</div>
            )}
        </div>

        {/* 💡 NUOVI BOTTONI AZIONE HEADER */}
        <div className="flex items-center gap-3">
            {isOwnProfile && isProfessional && (
                <button 
                    onClick={() => setIsEditingProfile(true)}
                    className="bg-blue-50 text-blue-600 font-bold px-4 py-2 rounded-xl hover:bg-blue-100 transition-all flex items-center gap-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <Icon type="edit" className="w-4 h-4" /> Modifica Info
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
                    <Icon type="alert-triangle" className="w-6 h-6 animate-pulse" />
                    SOS Vasca - Sostituzioni Urgenti
                </h2>
                <p className="text-red-600 text-sm mt-2 font-medium max-w-xl">
                    Attiva questa modalità per segnalare la tua disponibilità immediata. Riceverai priorità per le chiamate SOS dalle piscine nella tua zona.
                </p>
            </div>
            <button 
                onClick={async () => {
                    const newState = !profUser.availableForEmergencies;
                    const updated = await databaseService.updateProfile(profUser.userId || profUser.$id, { availableForEmergencies: newState });
                    if (onUpdateProfile) onUpdateProfile(updated as UserProfile);
                    showToast(newState ? 'SOS Vasca Attivato! Sei in prima linea.' : 'SOS Vasca Disattivato.', 'success');
                }}
                className={`relative inline-flex h-8 w-16 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${profUser.availableForEmergencies ? 'bg-red-600 shadow-inner' : 'bg-red-200'}`}
            >
                <span className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${profUser.availableForEmergencies ? 'translate-x-8' : 'translate-x-0'}`} />
            </button>
        </div>
      )}

      {isProfessional && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6 relative overflow-hidden" data-html2canvas-ignore="true">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 relative z-10">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                        Livello Passaporto Natatorio
                        {completionScore === 100 && (
                            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full flex items-center gap-1 border border-amber-200 shadow-sm animate-in zoom-in duration-500">
                                <Icon type="star" className="w-3 h-3" /> Pioniere SwimIn
                            </span>
                        )}
                    </h2>
                    <p className="text-sm text-slate-500 font-medium">Completa il profilo al 100% per avere massima visibilità dalle strutture.</p>
                </div>
                <span className="text-3xl font-extrabold text-blue-600">{completionScore}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden relative border border-slate-200/50 shadow-inner">
                <div 
                    className={`h-full transition-all duration-1000 relative ${completionScore === 100 ? 'bg-gradient-to-r from-blue-400 to-indigo-500' : 'bg-blue-400'}`} 
                    style={{ width: `${completionScore}%` }}
                >
                    <div className="absolute top-0 bottom-0 left-0 right-0 opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiPjwvcGF0aD4KPC9zdmc+')] mix-blend-overlay"></div>
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
                    Le mie Pagine Struttura
                </h2>
                <button
                    onClick={() => setIsFacilityModalOpen(true)}
                    className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <Icon type="plus" className="w-4 h-4" /> Crea Pagina
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
                                <p className="text-xs text-slate-500 font-medium truncate">{fac.type || 'Centro Sportivo'} • {fac.city}</p>
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
                        Sei il direttore o il proprietario di un impianto? Crea la tua Pagina Struttura per pubblicare annunci e gestire il tuo staff.
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
                      <button 
                          onClick={() => onContact(user.userId || user.$id)} 
                          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition-all flex items-center gap-2 shadow-sm active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                          data-html2canvas-ignore="true"
                      >
                          <Icon type="chat-bubble" className="w-4 h-4" /> Contatta
                      </button>
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
                    {isProfessional ? (profUser?.title || 'Professionista') : ((user as StructureProfile).structureType || 'Centro Sportivo')}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-slate-500 text-sm font-medium">
                      <span className="flex items-center gap-1.5"><Icon type="location" className="w-4 h-4" /> {user.city ? `${user.city} (${user.province})` : 'Località mancante'}</span>
                      <span className="hidden sm:inline text-slate-300">•</span>
                      <span className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2 py-1 rounded-lg"><Icon type="users" className="w-4 h-4" /> {(user.connections?.length || 0)} Collegamenti</span>
                  </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6">
            <h2 className="text-xl font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                <Icon type="info" className="w-5 h-5 text-blue-600" />
                Chi Sono
            </h2>
            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                {user.bio || 'Nessuna presentazione inserita.'}
            </p>
          </div>

          {isProfessional && (
            <>
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                            <Icon type="briefcase" className="w-6 h-6 text-blue-600" />
                            La mia Carriera
                        </h2>
                        {isOwnProfile && (
                            <button onClick={() => setExperienceModal({isOpen: true, mode: 'add'})} data-html2canvas-ignore="true" className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
                                <Icon type="plus" className="w-4 h-4" /> Aggiungi
                            </button>
                        )}
                    </div>

                    {experiences.length > 0 ? (
                        <div className="relative border-l-2 border-blue-100 ml-3 md:ml-4 space-y-8 pb-4">
                            {experiences.map((exp, index) => (
                            <div key={index} className="relative pl-6 sm:pl-8 group">
                                <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-4 border-white bg-blue-500 shadow-sm group-hover:scale-125 transition-transform duration-300"></div>
                                
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                    <div>
                                        <h3 className="font-extrabold text-lg text-slate-900 leading-tight group-hover:text-blue-600 transition-colors">{exp.role}</h3>
                                        <p className="text-slate-800 font-semibold mt-1 flex items-center gap-1.5">
                                            <Icon type="building" className="w-4 h-4 text-slate-400" /> {exp.facility}
                                        </p>
                                        <p className="text-xs font-bold text-blue-600/80 mt-1 uppercase tracking-wider">{exp.period}</p>
                                        {exp.description && <p className="text-sm text-slate-600 leading-relaxed mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100">{exp.description}</p>}
                                    </div>
                                    
                                    {isOwnProfile && (
                                        <div data-html2canvas-ignore="true" className="flex items-center gap-1 mt-2 sm:mt-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setExperienceModal({isOpen: true, mode: 'edit', experience: exp, index})} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Modifica">
                                                <Icon type="certificate" className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDeleteExperience(index)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Elimina">
                                                <Icon type="x" className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                            <Icon type="briefcase" className="w-10 h-10 text-slate-300 mb-3" />
                            <p className="text-slate-500 font-bold text-lg">Nessuna esperienza</p>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                            <Icon type="certificate" className="w-6 h-6 text-blue-600" />
                            Brevetti & Certificazioni
                        </h2>
                        {isOwnProfile && (
                            <button onClick={() => setCertificationModal({isOpen: true, mode: 'add'})} data-html2canvas-ignore="true" className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
                                <Icon type="plus" className="w-4 h-4" /> Aggiungi
                            </button>
                        )}
                    </div>

                    {certifications.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {certifications.map((cert, index) => {
                                const styles = getCertStyles(cert);
                                const expiryStatus = getExpiryStatus(cert.expiry); 
                                const isEndorsed = cert.issuer.toLowerCase().includes('piscina') || cert.issuer.toLowerCase().includes('club');

                                return (
                                <div key={index} className={`flex flex-col p-5 border rounded-2xl transition-all shadow-sm hover:shadow-md ${styles.bg} ${styles.border} group relative`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Icon type="star" className={`w-4 h-4 ${styles.icon}`} />
                                                <h3 className={`font-bold leading-tight ${styles.text}`}>{cert.name}</h3>
                                            </div>
                                            <p className="text-sm font-semibold text-slate-700 truncate">{cert.issuer}</p>
                                            
                                            {isEndorsed && (
                                                <div className="mt-2 inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-amber-200">
                                                    <Icon type="check-double" className="w-3 h-3" /> Verificato da Struttura
                                                </div>
                                            )}
                                        </div>
                                        
                                        {isOwnProfile && (
                                            <div data-html2canvas-ignore="true" className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 bg-white/80 backdrop-blur rounded-lg shadow-sm border border-white p-1">
                                                <button onClick={() => setCertificationModal({isOpen: true, mode: 'edit', certification: cert, index})} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md">
                                                    <Icon type="certificate" className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => handleDeleteCertification(index)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md">
                                                    <Icon type="x" className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-black/5">
                                        <span className="text-[10px] font-extrabold text-slate-600 bg-white/60 px-2 py-1 rounded border border-black/5 uppercase tracking-wider">{cert.category}</span>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${expiryStatus.style}`}>
                                            <Icon type={expiryStatus.icon as any} className="w-3 h-3" />
                                            {expiryStatus.text}
                                        </span>
                                    </div>
                                </div>
                            )})}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                            <Icon type="certificate" className="w-10 h-10 text-slate-300 mb-3" />
                            <p className="text-slate-500 font-bold text-lg">Nessun brevetto inserito</p>
                        </div>
                    )}
                </div>
            </>
          )}
      </div>

      <ExperienceModal isOpen={experienceModal.isOpen} onClose={() => setExperienceModal({ isOpen: false, mode: 'add' })} onSave={handleSaveExperience} experience={experienceModal.experience} mode={experienceModal.mode} />
      <CertificationModal isOpen={certificationModal.isOpen} onClose={() => setCertificationModal({ isOpen: false, mode: 'add' })} onSave={handleSaveCertification} certification={certificationModal.certification} mode={certificationModal.mode} />
      
      {/* 🏢 MODALE CREAZIONE PAGINA STRUTTURA */}
      {isFacilityModalOpen && (
            <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                    <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
                        <h2 className="text-xl font-extrabold text-slate-800">Crea Pagina Aziendale</h2>
                        <button onClick={() => setIsFacilityModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-200/50 rounded-full">
                            <Icon type="x" className="w-5 h-5"/>
                        </button>
                    </div>
                    <form onSubmit={handleCreateFacility} className="p-6 space-y-4">
                        <p className="text-sm text-slate-500 mb-4">La Pagina Struttura ti permette di pubblicare offerte di lavoro e gestire il tuo staff. Tu ne sarai l'Amministratore.</p>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Nome Struttura <span className="text-red-500">*</span></label>
                            <input required type="text" value={facilityForm.name} onChange={e=>setFacilityForm({...facilityForm, name: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="Es. Piscina Comunale Segrate" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Tipologia</label>
                            <input type="text" value={facilityForm.type} onChange={e=>setFacilityForm({...facilityForm, type: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="Es. Centro Sportivo, Aquapark..." />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Città <span className="text-red-500">*</span></label>
                            <input required type="text" value={facilityForm.city} onChange={e=>setFacilityForm({...facilityForm, city: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="Es. Milano" />
                        </div>
                        <button type="submit" disabled={isSubmittingFacility} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-blue-700 transition flex justify-center items-center gap-2 mt-4 disabled:opacity-70 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                            {isSubmittingFacility ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Icon type="plus" className="w-5 h-5" /> Crea Pagina</>}
                        </button>
                    </form>
                </div>
            </div>
      )}

      {/* 💡 NUOVA MODALE MODIFICA PROFILO PERSONALE */}
      {isEditingProfile && (
          <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
                      <h2 className="text-xl font-extrabold text-slate-800">Modifica Profilo Personale</h2>
                      <button onClick={() => setIsEditingProfile(false)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-200/50 rounded-full">
                          <Icon type="x" className="w-5 h-5"/>
                      </button>
                  </div>
                  <form onSubmit={handleSaveProfile} className="p-6 overflow-y-auto custom-scrollbar space-y-5 flex-1">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">Nome</label>
                              <input required type="text" value={editProfileForm.firstName} onChange={e=>setEditProfileForm({...editProfileForm, firstName: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">Cognome</label>
                              <input required type="text" value={editProfileForm.lastName} onChange={e=>setEditProfileForm({...editProfileForm, lastName: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Qualifica / Professione (Es. Istruttore FIN)</label>
                          <input type="text" value={editProfileForm.title} onChange={e=>setEditProfileForm({...editProfileForm, title: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">Città</label>
                              <input type="text" value={editProfileForm.city} onChange={e=>setEditProfileForm({...editProfileForm, city: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">Provincia (Sigla)</label>
                              <input type="text" maxLength={2} value={editProfileForm.province} onChange={e=>setEditProfileForm({...editProfileForm, province: e.target.value.toUpperCase()})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Chi sono (Bio)</label>
                          <textarea rows={4} value={editProfileForm.bio} onChange={e=>setEditProfileForm({...editProfileForm, bio: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Racconta qualcosa di te..." />
                      </div>
                      <p className="text-xs text-slate-500">Foto profilo e copertina si cambiano dal pulsante con la fotocamera sul profilo.</p>
                      <div className="pt-4 border-t border-slate-100 flex gap-3">
                          <button type="button" onClick={()=>setIsEditingProfile(false)} className="flex-1 font-bold text-slate-600 bg-slate-100 py-3 rounded-xl hover:bg-slate-200 transition">Annulla</button>
                          <button type="submit" className="flex-1 font-bold text-white bg-blue-600 py-3 rounded-xl hover:bg-blue-700 transition shadow-md">Salva Profilo</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

    </div>
  );
};