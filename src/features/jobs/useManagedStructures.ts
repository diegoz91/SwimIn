import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMyTeams } from '@/hooks/useMyTeams';
import type { StructureProfile } from '@/types/types';

export interface ManagedStructure {
    id: string;
    name: string;
    logo?: string;
    city?: string;
    province?: string;
}

/**
 * Strutture di cui chi è collegato gestisce annunci e staff: il proprio account Struttura,
 * oppure quelle in cui è co-amministratore (scelto dal titolare). Il server verifica ogni azione.
 */
export function useManagedStructures(): ManagedStructure[] | null {
    const { user } = useAuth();
    const { teams } = useMyTeams();

    return useMemo(() => {
        if (!user) return null;
        if (user.userType === 'structure') {
            const s = user as StructureProfile;
            return [{ id: user.$id, name: s.structureName || 'La tua struttura', logo: s.logo, city: s.city, province: s.province }];
        }
        if (teams === null) return null;
        return teams.filter((t) => t.role === 'admin').map((t) => ({ id: t.structureId, name: t.name, logo: t.logo || undefined, city: t.city || undefined }));
    }, [user, teams]);
}
