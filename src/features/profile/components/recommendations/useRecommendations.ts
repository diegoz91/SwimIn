import { useCallback, useEffect, useState } from 'react';
import { databaseService, type Recommendation } from '@/services/database';
import { useSignal } from '@/hooks/useSignal';

/** Referenze di un profilo (per il proprietario anche quelle da approvare e quelle non pubblicate). */
export function useRecommendations(profileId: string, enabled = true) {
    const [items, setItems] = useState<Recommendation[] | null>(null);

    const reload = useCallback(() => {
        if (!enabled) return;
        databaseService
            .listRecommendations(profileId)
            .then(setItems)
            .catch((err) => {
                console.warn('Referenze:', err);
                setItems([]);
            });
    }, [profileId, enabled]);

    useEffect(reload, [reload]);
    // Tempo reale: referenze scritte, pubblicate o nascoste dall'altra parte.
    useSignal(enabled ? `recs:${profileId}` : null, reload);

    const pending = (items || []).filter((r) => r.status === 'pending');
    const published = (items || []).filter((r) => r.status === 'published');
    const hidden = (items || []).filter((r) => r.status === 'hidden');
    return { items, setItems, reload, pending, published, hidden };
}
