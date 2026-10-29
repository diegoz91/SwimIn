import React, { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { ProfileView } from '@/features/profile/components/ProfileView';
import { FacilityView } from '@/features/profile/components/FacilityView';
import { Settings } from '@/features/profile/components/Settings';
import { PageLoader } from '@/components/common/PageLoader';
import type { UserProfile, StructureProfile, Job } from '@/types/types';
import { openChat } from '@/features/messaging/openChat';

// Due tipi di profilo: persona (professionista o appassionato) e account Struttura.
type ProfileType = UserProfile | StructureProfile;

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
        : viewedProfile.userType === 'professional'
            ? `${viewedProfile.firstName || ''} ${viewedProfile.lastName || ''}`.trim()
            : viewedProfile.structureName;
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
                        targetProfile = await databaseService.getProfile(id);
                    } catch (error) {
                        console.warn('Profilo non trovato:', error);
                    }
                }

                if (targetProfile) {
                    setViewedProfile(targetProfile);
                    
                    if (targetProfile.userType === 'structure') {
                        const allJobs = await databaseService.getActiveJobs();
                        const structureId = targetProfile.$id;
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

    if (isLoading) return <PageLoader variant="detail" />;

    if (!viewedProfile || !currentUser) return null;

    const handleContact = (userId: string) => {
        openChat(userId, navigate);
    };

    const handleProfileUpdate = (updatedProfile: ProfileType) => {
        setViewedProfile(updatedProfile);
        showToast('Informazioni aggiornate con successo!', 'success');
    };

    return (
        <div className="pt-4 w-full h-full relative">
            
            {/* Navigazione Impostazioni Personali */}
            {isOwnProfile && (
                <div className={`${activeTab === 'settings' ? 'max-w-5xl' : 'max-w-4xl'} mx-auto mb-6 flex justify-center sm:justify-start`}>
                    <div className="bg-slate-200/50 p-1.5 rounded-full flex gap-1">
                        <button 
                            onClick={() => navigate({ search: '' })}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'profile' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Il mio profilo
                        </button>
                        <button 
                            onClick={() => navigate({ search: '?tab=impostazioni' })}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'settings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Impostazioni
                        </button>
                    </div>
                </div>
            )}

            {/* Rendering Dinamico della Vista */}
            {activeTab === 'profile' ? (
                viewedProfile.userType === 'professional' ? (
                    <ProfileView 
                        user={viewedProfile as UserProfile} 
                        onBack={() => navigate(-1)} 
                        onContact={handleContact}
                        isOwnProfile={isOwnProfile}
                        onUpdateProfile={handleProfileUpdate}
                    />
                ) : (
                    <FacilityView
                        facility={viewedProfile}
                        openJobs={openJobs}
                        onBack={() => navigate(-1)}
                        onSelectJob={(jobId) => navigate(`/jobs/${jobId}`)}
                        onUpdateProfile={handleProfileUpdate}
                    />
                )
            ) : (
                <Settings 
                    currentUser={currentUser}
                    onNavigate={() => navigate({ search: '' })}
                    onLogout={logout}
                />
            )}
        </div>
    );
};

export default ProfilePage;