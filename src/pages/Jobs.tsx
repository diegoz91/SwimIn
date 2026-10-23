import React, { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Query } from 'appwrite';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { databases } from '@/services/appwrite';
import { databaseService } from '@/services/database';
import { APPWRITE_CONFIG } from '@/config/constants';
import { useToast } from '@/context/ToastContext';
import type { Job, Application, UserProfile } from '@/types/types';

import { LavoroView } from '@/features/jobs/components/LavoroView';
import { JobDetailView } from '@/features/jobs/components/JobDetailView';
import { MyApplicationsView, type EnrichedApplication } from '@/features/jobs/components/MyApplicationsView';
import { ApplicationFlowModal, type ApplicationFlowState, type CustomApplicationData } from '@/features/jobs/components/ApplicationFlowModal';

const Jobs: React.FC = () => {
    usePageTitle('Bacheca lavoro');
    const { user } = useAuth();
    const { showToast } = useToast();
    const location = useLocation();
    
    // Stati di Navigazione
    const [currentView, setCurrentView] = useState<'list' | 'detail' | 'myApplications'>('list');
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [myApplications, setMyApplications] = useState<EnrichedApplication[]>([]);
    
    // Stato Modale Candidatura
    const [flowState, setFlowState] = useState<ApplicationFlowState>({ step: 'idle', job: null });

    const fetchMyApplications = useCallback(async () => {
        if (!user) return;
        try {
            const res = await databases.listDocuments<Application>(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.applications,
                [Query.equal('applicantId', user.$id), Query.orderDesc('$createdAt')]
            );
            
            const enriched = await Promise.all(res.documents.map(async (app) => {
                try {
                    const job = await databases.getDocument<Job>(
                        APPWRITE_CONFIG.databaseId,
                        APPWRITE_CONFIG.collections.jobs,
                        app.jobId
                    );
                    return { ...app, job, facilityLogo: job.facilityLogo } as EnrichedApplication;
                } catch {
                    return null;
                }
            }));
            
            setMyApplications(enriched.filter(Boolean) as EnrichedApplication[]);
        } catch (error) {
            console.error('Error fetching applications', error);
        }
    }, [user]);

    useEffect(() => {
        fetchMyApplications();
    }, [fetchMyApplications]);

    // 💡 INTERCETTAZIONE REDIRECT DA PROFILO AZIENDALE
    useEffect(() => {
        // Annuncio da aprire: dal profilo aziendale (state) o da una notifica (?annuncio=).
        const fromLink = new URLSearchParams(location.search).get('annuncio');
        const jobId = location.state?.selectedJobId || fromLink;
        if (jobId) {
            handleSelectJob(jobId);
            // Pulisce la history per evitare re-aperture al refresh
            window.history.replaceState({}, document.title, location.pathname);
        }
    }, [location.state, location.search]);

    const handleSelectJob = async (jobId: string) => {
        try {
            const job = await databases.getDocument<Job>(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.jobs,
                jobId
            );
            setSelectedJob(job);
            setCurrentView('detail');
        } catch (error) {
            showToast('Errore nel caricamento dell\'annuncio.', 'error');
        }
    };

    const handleStartApplication = (job: Job) => {
        if (user?.userType === 'structure') {
            showToast('Le strutture non possono candidarsi.', 'error');
            return;
        }
        
        const hasApplied = myApplications.some(app => app.jobId === job.$id);
        if (hasApplied) {
            showToast('Ti sei già candidato per questa posizione.', 'info');
            return;
        }
        setFlowState({ step: 'requirements', job });
    };

    const handleSubmitApplication = async (type: 'rapida' | 'personalizzata', customData?: CustomApplicationData) => {
        if (!user || !flowState.job) return;
        try {
            await databaseService.applyForJob({
                jobId: flowState.job.$id,
                applicantId: user.$id,
                status: 'pending',
                coverLetter: type === 'personalizzata' && customData ? `${customData.coverLetter_interest}\n\n${customData.coverLetter_specialization}` : undefined
            });
            showToast('Candidatura inviata con successo!', 'success');
            await fetchMyApplications();
            setFlowState({ step: 'confirmation', job: flowState.job });
        } catch (error: any) {
            showToast(error.message || 'Errore invio candidatura.', 'error');
            setFlowState({ step: 'idle', job: null });
        }
    };

    const handleWithdrawApplication = async (applicationId: string) => {
        if (!window.confirm('Sicuro di voler ritirare la candidatura?')) return;
        try {
            await databases.deleteDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.applications,
                applicationId
            );
            showToast('Candidatura ritirata.', 'info');
            fetchMyApplications();
        } catch (error) {
            showToast('Errore nel ritiro della candidatura.', 'error');
        }
    };

    if (!user) return null;

    // 💡 CALCOLO RUOLI E STATI PER JOB DETAIL
    let isAdmin = false;
    if (selectedJob) {
        isAdmin = user.$id === selectedJob.structureId || 
                 (user.userType === 'professional' && ((user as UserProfile).managedFacilities || []).includes(selectedJob.structureId));
    }
    const hasApplied = selectedJob ? myApplications.some(app => app.jobId === selectedJob.$id) : false;

    return (
        <div className="pt-4 w-full h-full relative">
            
            {currentView === 'list' && (
                <LavoroView 
                    onSelectJob={handleSelectJob}
                    onApply={handleStartApplication}
                    onShowMyApplications={() => setCurrentView('myApplications')}
                />
            )}

            {currentView === 'detail' && selectedJob && (
                <JobDetailView 
                    job={selectedJob}
                    onBack={() => setCurrentView('list')}
                    onApply={handleStartApplication}
                    isAdmin={isAdmin}          // 💡 Passiamo i poteri
                    hasApplied={hasApplied}    // 💡 Passiamo lo stato
                />
            )}

            {currentView === 'myApplications' && (
                <MyApplicationsView 
                    applications={myApplications}
                    onBack={() => setCurrentView('list')}
                    onSelectJob={handleSelectJob}
                    onWithdraw={handleWithdrawApplication}
                />
            )}

            {user.userType === 'professional' && (
                <ApplicationFlowModal 
                    user={user}
                    job={flowState.job}
                    flowState={flowState}
                    setFlowState={setFlowState}
                    onSubmit={handleSubmitApplication}
                    onNavigate={(view) => {
                        setFlowState({ step: 'idle', job: null });
                        setCurrentView(view === 'myApplications' ? 'myApplications' : 'list');
                    }}
                />
            )}
        </div>
    );
};

export default Jobs;