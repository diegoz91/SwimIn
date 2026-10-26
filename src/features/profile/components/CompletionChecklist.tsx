import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CompletionRing } from './CompletionRing';
import { Button } from '@/components/ui/Button';

export interface CompletionStep { label: string; done: boolean; weight: number; hint?: string; onClick?: () => void }

/**
 * Completamento del profilo come elenco di passi: ogni passo mancante si apre con un tocco
 * (modifica, nuova esperienza, nuovo brevetto, CV…). Quelli fatti restano spuntati.
 */
export const CompletionChecklist: React.FC<{ score: number; steps: CompletionStep[] }> = ({ score, steps }) => {
    const [showDone, setShowDone] = useState(false);
    const missing = steps.filter((s) => !s.done);
    const done = steps.filter((s) => s.done);
    const next = missing[0];

    return (
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6" aria-labelledby="completion-title">
            <div className="flex items-center gap-5 sm:gap-6">
                <CompletionRing value={score} />
                <div className="min-w-0">
                    <h2 id="completion-title" className="text-xl font-bold text-abisso">Completa il profilo</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {missing.length === 1 ? 'Manca un passo' : `Mancano ${missing.length} passi`}: un profilo completo compare prima nelle ricerche delle strutture.
                    </p>
                    {next?.onClick && (
                        <Button size="sm" className="mt-3" onClick={next.onClick}>
                            {next.label} <span className="text-white font-normal">+{next.weight}%</span>
                        </Button>
                    )}
                </div>
            </div>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {missing.map((s) => (
                    <li key={s.label}>
                        <button
                            type="button"
                            onClick={s.onClick}
                            disabled={!s.onClick}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 text-left hover:border-corsia-300 hover:bg-corsia-50/40 transition-colors disabled:cursor-default"
                        >
                            <span className="w-7 h-7 rounded-full border-2 border-dashed border-corsia-300 text-corsia-700 grid place-items-center flex-shrink-0" aria-hidden="true">
                                <Icon type="plus" className="w-3.5 h-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-abisso">{s.label}</span>
                                {s.hint && <span className="block text-xs text-slate-500">{s.hint}</span>}
                            </span>
                            <span className="text-xs font-semibold text-corsia-700 flex-shrink-0">+{s.weight}%</span>
                        </button>
                    </li>
                ))}
            </ul>
            {done.length > 0 && (
                <div className="mt-3">
                    <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="py-1 -my-1 text-sm font-semibold text-slate-600 hover:text-abisso">
                        {showDone ? 'Nascondi i passi fatti' : `Fatti: ${done.length}`}
                    </button>
                    {showDone && (
                        <ul className="mt-2 flex flex-wrap gap-2">
                            {done.map((s) => (
                                <li key={s.label} className="inline-flex items-center gap-1.5 text-sm text-cloro-800 bg-cloro-50 border border-cloro-200 px-2.5 py-1 rounded-full">
                                    <Icon type="check" className="w-3.5 h-3.5" /> {s.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
};
