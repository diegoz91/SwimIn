import type { Certification } from '@/types/types';

export interface CertificationStatus extends Certification {
    /** Giorni alla scadenza (negativo se già scaduto); null se senza scadenza. */
    daysLeft: number | null;
    state: 'valid' | 'expiring' | 'expired' | 'no-expiry';
}

/** Entro quanti giorni un brevetto è considerato "in scadenza". */
export const EXPIRING_WITHIN_DAYS = 60;

export function parseCertifications(list?: string[] | null): Certification[] {
    return (list || [])
        .map((raw) => {
            try {
                return typeof raw === 'string' ? (JSON.parse(raw) as Certification) : (raw as Certification);
            } catch {
                return null;
            }
        })
        .filter((c): c is Certification => !!c && !!c.name);
}

export function certificationStatus(cert: Certification, today: Date = new Date()): CertificationStatus {
    if (!cert.expiry) return { ...cert, daysLeft: null, state: 'no-expiry' };
    const expiry = new Date(cert.expiry);
    if (Number.isNaN(expiry.getTime())) return { ...cert, daysLeft: null, state: 'no-expiry' };
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysLeft = Math.round((expiry.getTime() - start.getTime()) / 86_400_000);
    const state = daysLeft < 0 ? 'expired' : daysLeft <= EXPIRING_WITHIN_DAYS ? 'expiring' : 'valid';
    return { ...cert, daysLeft, state };
}

/** Brevetti scaduti o in scadenza, dal più urgente. */
export function certificationsNeedingAttention(list?: string[] | null, today: Date = new Date()): CertificationStatus[] {
    return parseCertifications(list)
        .map((c) => certificationStatus(c, today))
        .filter((c) => c.state === 'expired' || c.state === 'expiring')
        .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
}

export function describeExpiry(c: CertificationStatus): string {
    if (c.daysLeft === null) return 'Senza scadenza';
    if (c.daysLeft < 0) return `Scaduto da ${Math.abs(c.daysLeft)} ${Math.abs(c.daysLeft) === 1 ? 'giorno' : 'giorni'}`;
    if (c.daysLeft === 0) return 'Scade oggi';
    return `Scade tra ${c.daysLeft} ${c.daysLeft === 1 ? 'giorno' : 'giorni'}`;
}
