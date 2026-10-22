import React from 'react';
import { Icon, type IconType } from '@/components/ui/Icon';

interface LaneCard {
    icon: IconType;
    tone: string;
    title: string;
    detail: string;
    /** Spostamento orizzontale nella corsia, in percentuale. */
    offset: string;
}

const LANES: LaneCard[] = [
    { icon: 'certificate', tone: 'bg-cloro-100 text-cloro-700', title: 'Brevetto Assistente Bagnanti', detail: 'Valido fino a giugno 2027', offset: '6%' },
    { icon: 'alert-triangle', tone: 'bg-red-100 text-galleggiante', title: 'SOS: bagnino domani 14–20', detail: 'Aquae Sport Center, Sesto S. G.', offset: '22%' },
    { icon: 'star', tone: 'bg-amber-100 text-amber-700', title: 'Marco ha confermato', detail: '“Scuola nuoto bambini”', offset: '12%' },
    { icon: 'briefcase', tone: 'bg-corsia-100 text-corsia-700', title: 'Istruttore FIN, corsi serali', detail: 'Piscina Lido di Milano', offset: '30%' },
];

/** Galleggiante orizzontale tra due corsie. */
const Rope: React.FC = () => <div className="lane-rope opacity-90" aria-hidden="true" />;

/**
 * Una vasca vista dall'alto: quattro corsie divise dai galleggianti, con la T
 * di fine corsia sul fondo e, in ogni corsia, un pezzo reale del prodotto.
 */
export const PoolLanes: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div
        className={`relative rounded-[28px] overflow-hidden bg-gradient-to-b from-[#1592BE] to-[#0E6A97] p-3 sm:p-4 shadow-lift ${className}`}
        role="img"
        aria-label="Una vasca con quattro corsie: in ognuna scorre un esempio di SwimIn, come un brevetto, una richiesta di sostituzione urgente, una conferma di competenza e un'offerta di lavoro."
    >
        {/* riflessi dell'acqua */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.12] pointer-events-none" aria-hidden="true">
            <defs>
                <pattern id="caustics" width="120" height="60" patternUnits="userSpaceOnUse">
                    <path d="M0 30 C20 10 40 50 60 30 S100 10 120 30" fill="none" stroke="#fff" strokeWidth="2" />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#caustics)" />
        </svg>

        <div className="relative flex flex-col">
            <Rope />
            {LANES.map((lane, i) => (
                <React.Fragment key={lane.title}>
                    <div className="relative h-[86px] sm:h-[92px] flex items-center">
                        {/* linea e T di fine corsia sul fondo */}
                        <div className="absolute left-6 right-10 top-1/2 h-[6px] -translate-y-1/2 bg-abisso/25 rounded-full" aria-hidden="true" />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 w-[6px] h-9 bg-abisso/25 rounded-full" aria-hidden="true" />
                        <div
                            className="relative bg-white rounded-2xl pl-2 pr-4 py-2 flex items-center gap-3 shadow-card motion-safe:animate-[swim_9s_ease-in-out_infinite]"
                            style={{ marginLeft: lane.offset, maxWidth: `calc(100% - ${lane.offset} - 2.5rem)`, animationDelay: `${i * -2.1}s` }}
                        >
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${lane.tone}`}>
                                <Icon type={lane.icon} className="w-5 h-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-abisso truncate">{lane.title}</span>
                                <span className="block text-xs text-slate-500 truncate">{lane.detail}</span>
                            </span>
                        </div>
                    </div>
                    <Rope />
                </React.Fragment>
            ))}
        </div>
    </div>
);
