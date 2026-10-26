import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService, type MyApplication } from '@/services/database';
import { isEnthusiast } from '@/utils/profile';
import type { Job, UserProfile } from '@/types/types';
import { ApplicationFlowModal, type ApplicationFlowState, type ApplyData } from './components/ApplicationFlowModal';

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
            setFlow({ step: 'compose', job });
        },
        [canApply, applicationFor, showToast, user?.userType]
    );

    const submit = async (data: ApplyData) => {
        if (!user || !flow.job) return;
        const coverLetter = [data.coverLetter, data.availability ? `Disponibilità: ${data.availability}` : ''].filter(Boolean).join('\n\n');
        try {
            await databaseService.applyForJob({ jobId: flow.job.$id, applicantId: user.$id, status: 'pending', coverLetter: coverLetter || undefined, attachResume: data.attachResume });
            await reload();
            setFlow({ step: 'confirmation', job: flow.job });
        } catch (err) {
            // La finestra resta aperta: la persona non perde il messaggio scritto.
            showToast(err instanceof Error ? err.message : 'Candidatura non inviata.', 'error');
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
