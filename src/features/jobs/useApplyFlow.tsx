import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService, type MyApplication } from '@/services/database';
import { isEnthusiast } from '@/utils/profile';
import type { Job, UserProfile } from '@/types/types';
import { ApplicationFlowModal, type ApplicationFlowState, type CustomApplicationData } from './components/ApplicationFlowModal';

/**
 * Candidature di chi cerca lavoro: elenco delle proprie (per sapere dove si è già candidati)
 * e percorso di candidatura nella finestra dedicata. Usato da bacheca e pagina dell'annuncio.
 */
export function useApplyFlow() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [applications, setApplications] = useState<MyApplication[] | null>(null);
    const [flow, setFlow] = useState<ApplicationFlowState>({ step: 'idle', job: null });

    /** Solo i professionisti si candidano (non le strutture né gli appassionati). */
    const canApply = !!user && user.userType === 'professional' && !isEnthusiast(user);

    const reload = useCallback(async () => {
        if (!user || !canApply) return setApplications([]);
        try {
            setApplications(await databaseService.getMyApplications(user.$id));
        } catch (err) {
            console.error('Candidature:', err);
            setApplications([]);
        }
    }, [user, canApply]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const applicationFor = useCallback((jobId: string) => (applications || []).find((a) => a.jobId === jobId) || null, [applications]);

    const start = useCallback(
        (job: Job) => {
            if (!canApply) {
                showToast(user?.userType === 'structure' ? 'Le strutture non si candidano: pubblicano annunci.' : 'Per candidarti imposta il profilo come professionista in Modifica profilo.', 'info');
                return;
            }
            if (applicationFor(job.$id)) {
                showToast('Ti sei già candidato per questa posizione.', 'info');
                return;
            }
            setFlow({ step: 'requirements', job });
        },
        [canApply, applicationFor, showToast, user?.userType]
    );

    const submit = async (type: 'rapida' | 'personalizzata', custom?: CustomApplicationData) => {
        if (!user || !flow.job) return;
        try {
            await databaseService.applyForJob({
                jobId: flow.job.$id,
                applicantId: user.$id,
                status: 'pending',
                coverLetter: type === 'personalizzata' && custom ? `${custom.coverLetter_interest}\n\n${custom.coverLetter_specialization}`.trim() : undefined,
            });
            showToast('Candidatura inviata: la struttura riceve subito una notifica.', 'success');
            await reload();
            setFlow({ step: 'confirmation', job: flow.job });
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Candidatura non inviata.', 'error');
            setFlow({ step: 'idle', job: null });
        }
    };

    const modal =
        canApply && user ? (
            <ApplicationFlowModal
                user={user as UserProfile}
                job={flow.job}
                flowState={flow}
                setFlowState={setFlow}
                onSubmit={submit}
                onNavigate={(view) => {
                    setFlow({ step: 'idle', job: null });
                    navigate(view === 'myApplications' ? '/jobs/candidature' : '/jobs');
                }}
            />
        ) : null;

    return { canApply, applications, applicationFor, start, reload, modal };
}
