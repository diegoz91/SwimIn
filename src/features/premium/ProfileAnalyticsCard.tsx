import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Icon, type IconType } from '@/components/ui/Icon';
import { databaseService } from '@/services/database';
import { requestPremium } from '@/services/premiumPrompt';
import { PremiumBadge } from './PremiumBadge';

type Numbers = { views: number | null; interactions: number | null; structures: number | null };

/**
 * Riquadro "Analisi" sul proprio profilo, solo per te: tre numeri degli ultimi 30 giorni
 * e il link alla pagina completa delle statistiche. Con il piano Base mostra le visite.
 */
export const ProfileAnalyticsCard: React.FC<{ premium: boolean; onOpenViews: () => void }> = ({ premium, onOpenViews }) => {
    const [n, setN] = useState<Numbers>({ views: null, interactions: null, structures: null });

    useEffect(() => {
        let alive = true;
        if (premium) {
            databaseService
                .getMyStats()
                .then((s) => alive && setN({ views: s.viewsLast30, interactions: s.totals.reactions + s.totals.comments + s.totals.reposts, structures: s.viewersByKind.strutture }))
                .catch((err) => console.warn('Analisi del profilo:', err));
        } else {
            databaseService.listProfileViews().then((v) => alive && setN((x) => ({ ...x, views: v.total }))).catch((err) => console.warn('Visite al profilo:', err));
        }
        return () => { alive = false; };
    }, [premium]);

    const locked = () => requestPremium('Le statistiche del profilo e dei post sono incluse in SwimIn Premium.');

    return (
        <section aria-labelledby="analytics-title" className="bg-white rounded-3xl shadow-xs border border-slate-200 p-6 sm:p-8 mb-6" data-html2canvas-ignore="true">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                    <h2 id="analytics-title" className="text-xl font-bold text-abisso">Analisi</h2>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5"><Icon type="lock-closed" className="w-4 h-4" /> Solo per te · ultimi 30 giorni</p>
                </div>
                <Link to="/statistiche" className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Tutte le statistiche</Link>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
                <Tile icon="user-circle" value={n.views} label={n.views === 1 ? 'visita al profilo' : 'visite al profilo'} hint="Scopri chi ti ha visto" onClick={onOpenViews} />
                <Tile icon="like" value={n.interactions} label="interazioni con i post" hint="Reazioni, commenti, ripubblicazioni" locked={!premium} onClick={premium ? undefined : locked} to={premium ? '/statistiche' : undefined} />
                <Tile icon="building" value={n.structures} label={n.structures === 1 ? 'struttura ti ha visitato' : 'strutture ti hanno visitato'} hint="Piscine e centri che ti cercano" locked={!premium} onClick={premium ? undefined : locked} to={premium ? '/statistiche' : undefined} />
            </div>
        </section>
    );
};

const Tile: React.FC<{ icon: IconType; value: number | null; label: string; hint: string; locked?: boolean; onClick?: () => void; to?: string }> = ({ icon, value, label, hint, locked, onClick, to }) => {
    const body = (
        <>
            <span className="flex items-center justify-between">
                <Icon type={icon} className="w-5 h-5 text-corsia-600" />
                {locked && <PremiumBadge />}
            </span>
            <span className="block font-display text-3xl font-bold text-abisso mt-2 tabular-nums">{locked ? '–' : value === null ? <span className="inline-block w-10 h-7 rounded-sm bg-slate-100 animate-pulse align-middle" /> : value.toLocaleString('it-IT')}</span>
            <span className="block text-sm font-semibold text-abisso">{label}</span>
            <span className="block text-sm text-slate-500 mt-0.5">{locked ? 'Con Premium' : hint}</span>
        </>
    );
    const cls = 'block text-left rounded-2xl border border-slate-200 bg-piastrella/50 p-4 hover:border-corsia-300 hover:bg-white transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-400';
    return to ? <Link to={to} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={`${cls} w-full`}>{body}</button>;
};
