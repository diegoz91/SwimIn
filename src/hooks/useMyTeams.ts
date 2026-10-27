import { useEffect, useState } from 'react';
import { databaseService, type MyTeam } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import { useSignal } from '@/hooks/useSignal';

/**
 * Strutture in cui lavoro (staff o amministratore), condivise da intestazione, home e turni:
 * una sola richiesta per tutta l'app, aggiornata in tempo reale quando entro o esco da uno staff.
 */
let cache: { userId: string; teams: MyTeam[] } | null = null;
let inflight: Promise<MyTeam[]> | null = null;
const listeners = new Set<(t: MyTeam[]) => void>();

const fetchTeams = (userId: string) => {
    inflight ??= databaseService
        .listMyTeams()
        .catch((err) => {
            console.warn('Strutture in cui lavoro:', err);
            return cache?.userId === userId ? cache.teams : [];
        })
        .then((teams) => {
            cache = { userId, teams };
            listeners.forEach((l) => l(teams));
            return teams;
        })
        .finally(() => { inflight = null; });
    return inflight;
};

export function useMyTeams(): { teams: MyTeam[] | null; reload: () => void } {
    const { user } = useAuth();
    const userId = user?.$id || '';
    const [teams, setTeams] = useState<MyTeam[] | null>(() => (cache && cache.userId === userId ? cache.teams : null));

    useEffect(() => {
        if (!userId) return;
        listeners.add(setTeams);
        if (cache?.userId === userId) setTeams(cache.teams);
        else void fetchTeams(userId);
        return () => { listeners.delete(setTeams); };
    }, [userId]);

    // Assunto, invitato, rimosso: la Function manda un segnale "team:<struttura>".
    useSignal(userId ? 'team:*' : null, (_t, kind) => {
        if (['respondStaffInvite', 'removeStaffMember', 'hireCandidate', 'inviteStaff', 'cancelStaffInvite'].includes(kind)) void fetchTeams(userId);
    }, 600);

    return { teams: userId ? teams : [], reload: () => void fetchTeams(userId) };
}
