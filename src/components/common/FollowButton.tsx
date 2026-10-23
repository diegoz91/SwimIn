import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';

/** "Segui": vedi i post di qualcuno nel tuo feed senza essere collegati. */
export const FollowButton: React.FC<{ profileId: string; className?: string; onChange?: (following: boolean, followers: number) => void }> = ({ profileId, className = '', onChange }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [following, setFollowing] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!user || user.$id === profileId) return;
        let alive = true;
        databaseService.isFollowing(user.$id, profileId).then((f) => alive && setFollowing(f)).catch((err) => { console.warn('Segui:', err); if (alive) setFollowing(false); });
        return () => { alive = false; };
    }, [user, profileId]);

    if (!user || user.$id === profileId || following === null) return null;

    const toggle = async () => {
        setBusy(true);
        try {
            const res = await databaseService.toggleFollow(profileId);
            setFollowing(res.following);
            onChange?.(res.following, res.followersCount);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-pressed={following}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 ${following ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'border border-corsia-300 text-corsia-700 hover:bg-corsia-50'} ${className}`}
        >
            <Icon type={following ? 'check' : 'plus'} className="w-4 h-4" /> {following ? 'Segui già' : 'Segui'}
        </button>
    );
};
