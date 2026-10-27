import type { StructureProfile, UserProfile } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';

type AnyProfile = Partial<UserProfile> | Partial<StructureProfile>;

/** Nome da mostrare per persona o struttura. */
export function displayNameOf(p?: AnyProfile | null): string {
    if (!p) return 'Membro di SwimIn';
    if ('userType' in p && p.userType === 'professional') {
        const u = p as Partial<UserProfile>;
        return `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Utente';
    }
    return (p as Partial<StructureProfile>).structureName || 'Struttura';
}

/** Foto profilo o logo; in mancanza, avatar con le iniziali. */
export function avatarOf(p?: AnyProfile | null): string {
    const image = p && 'userType' in p && p.userType === 'professional' ? (p as Partial<UserProfile>).avatar : (p as Partial<StructureProfile> | undefined)?.logo;
    return image || initialsAvatar(displayNameOf(p));
}

/** Qualifica o tipologia della struttura. */
export function headlineOf(p?: AnyProfile | null): string {
    if (!p) return '';
    if ('userType' in p && p.userType === 'professional') {
        const u = p as Partial<UserProfile>;
        return u.title || (u.personType === 'enthusiast' ? 'Appassionato di nuoto' : 'Professionista del nuoto');
    }
    return (p as Partial<StructureProfile>).structureType || 'Struttura sportiva';
}

/** Persona che pratica il nuoto per passione (non cerca lavoro nel settore). */
export const isEnthusiast = (p?: AnyProfile | null): boolean =>
    !!p && 'userType' in p && p.userType === 'professional' && (p as Partial<UserProfile>).personType === 'enthusiast';

/** Media delle recensioni (1 decimale) o null se non ce ne sono. */
export function ratingOf(p?: { ratingSum?: number; ratingCount?: number } | null): { average: number; count: number } | null {
    const count = p?.ratingCount || 0;
    if (!count) return null;
    return { average: Math.round(((p?.ratingSum || 0) / count) * 10) / 10, count };
}
