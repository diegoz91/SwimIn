import { useEffect, useState } from 'react';
import { databaseService } from '@/services/database';

export interface ContactInfo { phone: string; email: string; allowed: boolean }

/**
 * Recapiti privati di un profilo (telefono, email). Il server li restituisce solo
 * alla persona stessa, ai suoi collegamenti e a chi valuta una sua candidatura.
 */
export function useContactInfo(profileId: string | undefined, enabled = true): ContactInfo | null {
    const [info, setInfo] = useState<ContactInfo | null>(null);
    useEffect(() => {
        if (!profileId || !enabled) { setInfo(null); return; }
        let alive = true;
        databaseService.getContactInfo(profileId)
            .then((res) => alive && setInfo(res))
            .catch((err) => { console.error('Recapiti:', err); if (alive) setInfo(null); });
        return () => { alive = false; };
    }, [profileId, enabled]);
    return info;
}
