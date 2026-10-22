import React, { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { ProfileView } from '@/features/profile/components/ProfileView';
import { FacilityView } from '@/features/profile/components/FacilityView';
import { Settings } from '@/features/profile/components/Settings';
import type { UserProfile, StructureProfile, Job, Facility } from '@/types/types';

// Uniamo i tre mondi: Professionista, Vecchia Struttura e Nuova Pagina Aziendale (Facility)
type ProfileType = UserProfile | StructureProfile | Facility;

const ProfilePage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { user: currentUser, logout } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    const [viewedProfile, setViewedProfile] = useState<ProfileType | null>(null);
    const [openJobs, setOpenJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const tabFromUrl = new URLSearchParams(location.search).get('tab') === 'impostazioni' ? 'settings' : 'profile';
    const [activeTab, setActiveTab] = useState<'profile' | 'settings'>(tabFromUrl);
    useEffect(() => setActiveTab(tabFromUrl), [tabFromUrl]);

    const isOwnProfile = !id || id === currentUser?.$id;

    const viewedName = !viewedProfile ? null
        : 'userType' in viewedProfile
            ? (viewedProfile.userType === 'professional'
                ? `${viewedProfile.firstName || ''} ${viewedProfile.lastName || ''}`.trim()
                : viewedProfile.structureName)
            : viewedProfile.name;
    usePageTitle(isOwnProfile ? 'Il mio profilo' : viewedName || 'Profilo');

    useEffect(() => {
        const fetchProfileData = async () => {
            setIsLoading(true);
            try {
                let targetProfile: ProfileType | null = null;
                
                if (isOwnProfile && currentUser) {
                    targetProfile = currentUser;
                } else if (id) {
                    try {
                        // 1. Prova a cercare nei profili normali
                        targetProfile = await databaseService.getProfile(id);
                    } catch (error) {
                        try {
                            // 2. Se non lo trova, cerca nelle Pagine Aziendali (Facilities)
                            const fac = await databaseService.getFacility(id);
                            if (fac) targetProfile = fac;
                        } catch (e) {
                            // Nessun profilo trovato
                        }
                    }
                }

                if (targetProfile) {
                    setViewedProfile(targetProfile);
                    
                    const isLegacyStructure = 'userType' in targetProfile && targetProfile.userType === 'structure';
                    const isFacility = !('userType' in targetProfile);
                    
                    if (isLegacyStructure || isFacility) {
                        const allJobs = await databaseService.getActiveJobs();
                        const structureId = ('userId' in targetProfile && targetProfile.userId) ? targetProfile.userId : targetProfile.$id;
                        setOpenJobs(allJobs.filter(job => job.structureId === structureId));
                    }
                } else {
                    showToast('Profilo non trovato.', 'error');
                    navigate('/');
                }
            } catch (error) {
                showToast('Impossibile caricare la pagina.', 'error');
                navigate('/');
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfileData();
    }, [id, isOwnProfile, currentUser, navigate, showToast]);

    if (isLoading) {
        return (
            <div className="pt-16 flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
            </div>
        );
    }

    if (!viewedProfile || !currentUser) return null;

    const handleContact = (userId: string) => {
        navigate(`/messages`, { state: { startChatWithUserId: userId } });
    };

    const handleProfileUpdate = (updatedProfile: ProfileType) => {
        setViewedProfile(updatedProfile);
        showToast('Informazioni aggiornate con successo!', 'success');
    };

    return (
        <div className="pt-4 w-full h-full relative">
            
            {/* Navigazione Impostazioni Personali */}
            {isOwnProfile && (
                <div className="max-w-4xl mx-auto mb-6 flex justify-center sm:justify-start">
                    <div className="bg-slate-200/50 p-1.5 rounded-full flex gap-1">
                        <button 
                            onClick={() => setActiveTab('profile')}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'profile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Il mio Profilo
                        </button>
                        <button 
                            onClick={() => setActiveTab('settings')}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'settings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Impostazioni
                        </button>
                    </div>
                </div>
            )}

            {/* Rendering Dinamico della Vista */}
            {activeTab === 'profile' ? (
                ('userType' in viewedProfile && viewedProfile.userType === 'professional') ? (
                    <ProfileView 
                        user={viewedProfile as UserProfile} 
                        onBack={() => navigate(-1)} 
                        onContact={handleContact}
                        isOwnProfile={isOwnProfile}
                        onUpdateProfile={handleProfileUpdate}
                    />
                ) : (
                    <FacilityView
                        facility={viewedProfile as (StructureProfile | Facility)}
                        openJobs={openJobs}
                        onBack={() => navigate(-1)}
                        // 💡 FIX REDIRECT: Intercetta il click sull'annuncio e passa lo State Router a /jobs!
                        onSelectJob={(jobId) => navigate(`/jobs`, { state: { selectedJobId: jobId } })}
                        onUpdateProfile={handleProfileUpdate}
                    />
                )
            ) : (
                <Settings 
                    currentUser={currentUser}
                    onNavigate={() => setActiveTab('profile')}
                    onLogout={logout}
                />
            )}
        </div>
    );
};

export default ProfilePage;