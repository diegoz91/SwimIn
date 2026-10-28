import React, { useState } from 'react';
import { Link } from 'react-router';
import { PeopleModal, type PersonRow } from '@/components/common/PeopleModal';
import { databaseService } from '@/services/database';
import { formatRelativeTime } from '@/utils/format';
import { PremiumBadge } from './PremiumBadge';

/**
 * "Chi ha visto il tuo profilo": la stessa finestra dal profilo e dalle statistiche.
 * Si apre sopra la pagina in cui sei e, chiusa, ti lascia lì.
 */
export const ProfileViewersModal: React.FC<{ open: boolean; onClose: () => void; onTotal?: (total: number) => void }> = ({ open, onClose, onTotal }) => {
    const [locked, setLocked] = useState(0);
    const load = async (): Promise<PersonRow[]> => {
        const r = await databaseService.listProfileViews();
        onTotal?.(r?.total ?? 0);
        setLocked(r?.locked || 0);
        return (r?.viewers || []).map((v) => ({ id: v.id, name: v.name, headline: v.headline, avatar: v.avatar, meta: formatRelativeTime(v.viewedAt) }));
    };
    return (
        <PeopleModal
            open={open}
            title="Chi ha visto il tuo profilo"
            subtitle="Negli ultimi 30 giorni"
            load={load}
            empty="Ancora nessuna visita negli ultimi 30 giorni. Un profilo completo e qualche post aiutano a farsi trovare."
            footer={locked > 0 ? (
                <div className="m-2 rounded-xl border border-oro-300 bg-oro-50 p-4 text-center">
                    <p className="font-semibold text-abisso flex items-center justify-center gap-2"><PremiumBadge /> Altre {locked} {locked === 1 ? 'persona ha' : 'persone hanno'} visto il tuo profilo</p>
                    <p className="text-sm text-slate-600 mt-1">Con Premium vedi tutti i visitatori degli ultimi 30 giorni e le statistiche.</p>
                    <Link to="/premium" onClick={onClose} className="inline-block mt-3 px-4 py-2 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900">Scopri Premium</Link>
                </div>
            ) : null}
            onClose={onClose}
        />
    );
};
