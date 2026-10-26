import { useCallback, useEffect, useState } from 'react';
import { databaseService } from '@/services/database';
import { uploadResume } from '@/services/resume';
import { useAuth } from '@/hooks/useAuth';
import type { ResumeInfo } from '@/types/types';

/**
 * Il mio CV, condiviso tra profilo e candidatura: caricarlo da una parte lo aggiorna
 * anche nell'altra. `undefined` = in caricamento, `null` = nessun CV.
 */
let cache: { userId: string; resume: ResumeInfo | null } | null = null;
const listeners = new Set<(r: ResumeInfo | null) => void>();
const publish = (userId: string, resume: ResumeInfo | null) => {
    cache = { userId, resume };
    listeners.forEach((l) => l(resume));
};

export function useMyResume(enabled = true) {
    const { user } = useAuth();
    const userId = user?.$id || '';
    const [resume, setResume] = useState<ResumeInfo | null | undefined>(() => (cache?.userId === userId ? cache.resume : undefined));
    const [busy, setBusy] = useState(false);
    /** Percentuale del caricamento in corso, null se non si sta caricando. */
    const [progress, setProgress] = useState<number | null>(null);

    useEffect(() => {
        if (!userId || !enabled) return;
        listeners.add(setResume);
        if (cache?.userId === userId) setResume(cache.resume);
        else
            databaseService
                .getMyResume()
                .then((r) => publish(userId, r))
                .catch((err) => {
                    console.warn('CV:', err);
                    setResume(null);
                });
        return () => { listeners.delete(setResume); };
    }, [userId, enabled]);

    const upload = useCallback(
        async (file: File) => {
            setBusy(true);
            setProgress(0);
            try {
                const saved = await uploadResume(file, userId, setProgress);
                publish(userId, saved);
                return saved;
            } finally {
                setBusy(false);
                setProgress(null);
            }
        },
        [userId]
    );

    const remove = useCallback(async () => {
        setBusy(true);
        try {
            await databaseService.deleteMyResume();
            publish(userId, null);
        } finally {
            setBusy(false);
        }
    }, [userId]);

    return { resume, busy, progress, upload, remove };
}
