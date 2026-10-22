import type { Facility, StructureProfile, UserProfile } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';

type AnyProfile = Partial<UserProfile> | Partial<StructureProfile> | Partial<Facility>;

/** Nome da mostrare per professionista, struttura o pagina struttura. */
export function displayNameOf(p?: AnyProfile | null): string {
    if (!p) return 'Membro di SwimIn';
    if ('userType' in p && p.userType === 'professional') {
        const u = p as Partial<UserProfile>;
        return `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Utente';
    }
    if ('userType' in p && p.userType === 'structure') return (p as Partial<StructureProfile>).structureName || 'Struttura';
    return (p as Partial<Facility>).name || 'Struttura';
}

/** Foto profilo o logo; in mancanza, avatar con le iniziali. */
export function avatarOf(p?: AnyProfile | null): string {
    const image = p && 'userType' in p && p.userType === 'professional' ? (p as Partial<UserProfile>).avatar : (p as Partial<StructureProfile> | undefined)?.logo;
    return image || initialsAvatar(displayNameOf(p));
}

/** Qualifica o tipologia della struttura. */
export function headlineOf(p?: AnyProfile | null): string {
    if (!p) return '';
    if ('userType' in p && p.userType === 'professional') return (p as Partial<UserProfile>).title || 'Professionista del nuoto';
    if ('userType' in p) return (p as Partial<StructureProfile>).structureType || 'Struttura sportiva';
    return (p as Partial<Facility>).type || 'Struttura sportiva';
}
