import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import type { StructureProfile, UserProfile } from '@/types/types';

export interface ManagedStructure {
    id: string;
    name: string;
    logo?: string;
    city?: string;
    province?: string;
}

/**
 * Strutture di cui chi è collegato gestisce annunci e staff: il proprio profilo Struttura
 * e le pagine struttura di cui è amministratore. Il server verifica comunque ogni azione.
 */
export function useManagedStructures() {
    const { user } = useAuth();
    const [list, setList] = useState<ManagedStructure[] | null>(null);
    const facilityIds = user?.userType === 'professional' ? ((user as UserProfile).managedFacilities || []).join(',') : '';

    useEffect(() => {
        if (!user) return;
        let alive = true;
        (async () => {
            const out: ManagedStructure[] = [];
            if (user.userType === 'structure') {
                const s = user as StructureProfile;
                out.push({ id: user.$id, name: s.structureName || 'La tua struttura', logo: s.logo, city: s.city, province: s.province });
            }
            for (const id of facilityIds ? facilityIds.split(',') : []) {
                const f = await databaseService.getFacility(id);
                if (f) out.push({ id: f.$id, name: f.name, logo: f.logo, city: f.city, province: f.province });
            }
            if (alive) setList(out);
        })().catch((err) => {
            console.error('Strutture gestite:', err);
            if (alive) setList([]);
        });
        return () => {
            alive = false;
        };
    }, [user?.$id, user?.userType, facilityIds]); // eslint-disable-line react-hooks/exhaustive-deps

    return list;
}
